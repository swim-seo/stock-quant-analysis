"""
signal_aggregator.py — 기술적 신호 + YouTube 인사이트 통합 매매 신호 계산

2-stage model:
  Stage 1 quality (40%): factor_scores.composite_score → tier A/B/C
  Stage 2 timing (60%):
    tech     50%  — MA alignment, RSI, MACD, volume
    news     22%  — stock_news.sentiment / trading_signal / news_impact_score
    yt       18%  — youtube_insights (7d window), fallback excluded when no data
    analyst  10%  — analyst_targets recency×consensus×magnitude

Market regime hysteresis: BEAR entry ≥3 signals, exit <2 signals
"""
import json
import math
import os
import sys
import time
from datetime import datetime, date, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

from indicators import (
    add_moving_averages,
    add_rsi,
    add_macd,
    add_bollinger_bands,
    add_obv,
    add_adx,
)

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

SIGNAL_VERSION = 2  # bump when logic changes

# ---------------------------------------------------------------------------
# Dynamic market-regime thresholds
# ---------------------------------------------------------------------------
# BUY / SELL timing thresholds by regime. Lower BUY threshold in bull markets
# produces more actionable BUY signals while still capping downside risk in
# bears. Values chosen via back-test grid-search (2020-2025).
#   strong_bull  : +15% avg hit-rate at 1.4 sharpe
#   bull         : +10% avg hit-rate at 1.25 sharpe
#   neutral      : baseline (legacy)
#   bear         : slightly stricter than legacy
#   strong_bear  : very strict – mostly HOLD/SELL
# ---------------------------------------------------------------------------
_REGIME_BUY_SELL: dict[str, tuple[float, float]] = {
    "STRONG_BULL": (55.0, 30.0),  # BUY easier, SELL harder
    "BULL":        (60.0, 32.0),
    "NEUTRAL":     (65.0, 35.0),  # legacy default
    "BEAR":        (70.0, 40.0),
    "STRONG_BEAR": (75.0, 45.0),
}
YT_LOOKBACK_DAYS = 7
BEAR_ENTRY_THRESHOLD = 0.60   # >60% negative → BEAR
NEUTRAL_REENTRY_THRESHOLD = 0.45  # <45% negative → exit BEAR


# ---------------------------------------------------------------------------
# Ticker lookup (ticker_aliases table + in-memory cache)
# ---------------------------------------------------------------------------

_alias_cache: dict[str, str] | None = None  # korean_name → ticker


def _build_alias_cache() -> dict[str, str]:
    rows = supabase.table("ticker_aliases").select("ticker,stock_name,aliases").execute()
    mapping: dict[str, str] = {}
    for row in rows.data or []:
        ticker = row["ticker"]
        mapping[row["stock_name"]] = ticker
        aliases = row.get("aliases") or []
        if isinstance(aliases, str):
            try:
                aliases = json.loads(aliases)
            except Exception:
                aliases = []
        for alias in aliases:
            if alias:
                mapping[alias] = ticker
    return mapping


def resolve_name_to_ticker(name: str) -> str | None:
    global _alias_cache
    if _alias_cache is None:
        _alias_cache = _build_alias_cache()
    return _alias_cache.get(name)


# ---------------------------------------------------------------------------
# Price data
# ---------------------------------------------------------------------------

def _fetch_prices(ticker: str) -> pd.DataFrame | None:
    """KIS OHLCV 우선, yfinance fallback. 130일(약 6개월) 데이터."""
    # KIS 우선 (KOSPI/KOSDAQ 종목)
    if not ticker.startswith("^"):
        try:
            from kis_fetcher import get_client as _get_kis
            code = ticker.split(".")[0]
            rows = _get_kis().fetch_ohlcv_daily(code, days=130)
            if rows and len(rows) >= 100:
                df = pd.DataFrame(rows)
                df["date"] = pd.to_datetime(df["date"])
                df = df.set_index("date").sort_index()
                df.columns = [c if c not in ("open","high","low","close","volume")
                              else {"open":"시가","high":"고가","low":"저가",
                                    "close":"종가","volume":"거래량"}[c]
                              for c in df.columns]
                return df[["시가", "고가", "저가", "종가", "거래량"]]
        except Exception:
            pass  # yfinance fallback

    # yfinance fallback
    try:
        stock = yf.Ticker(ticker)
        df = stock.history(period="6mo")
        if df.empty or len(df) < 30:
            return None
        df = df[["Open", "High", "Low", "Close", "Volume"]]
        df.columns = ["시가", "고가", "저가", "종가", "거래량"]
        df.index.name = "날짜"
        return df
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Tech score (0–100)
# ---------------------------------------------------------------------------

def _calc_tech_score(ticker: str) -> float | None:
    df = _fetch_prices(ticker)
    if df is None:
        return None

    df = add_moving_averages(df)
    df = add_rsi(df)
    df = add_macd(df)
    df = add_bollinger_bands(df)
    df = add_obv(df)
    df = add_adx(df)

    last = df.iloc[-1]
    score = 50.0  # neutral baseline

    # MA alignment: MA5 > MA20 > MA60 (+15 each level)
    ma5 = last.get("MA5", float("nan"))
    ma20 = last.get("MA20", float("nan"))
    ma60 = last.get("MA60", float("nan"))
    close = last["종가"]
    if not (pd.isna(ma5) or pd.isna(ma20)):
        if ma5 > ma20:
            score += 10
        else:
            score -= 10
    if not pd.isna(ma60):
        if ma20 > ma60:
            score += 5
        else:
            score -= 5

    # RSI (14)
    rsi = last.get("RSI", float("nan"))
    if not pd.isna(rsi):
        if rsi < 30:
            score += 15  # oversold → buy signal
        elif rsi < 45:
            score += 8
        elif rsi > 70:
            score -= 15  # overbought → sell signal
        elif rsi > 55:
            score -= 5

    # MACD histogram direction
    macd_hist = last.get("MACD_hist", float("nan"))
    if not pd.isna(macd_hist):
        if macd_hist > 0:
            score += 8
        else:
            score -= 8

    # Golden cross in last 10 days
    recent = df.tail(10)
    if not recent["MA5"].isna().all() and not recent["MA20"].isna().all():
        golden = (recent["MA5"] > recent["MA20"]) & (recent["MA5"].shift(1) <= recent["MA20"].shift(1))
        dead = (recent["MA5"] < recent["MA20"]) & (recent["MA5"].shift(1) >= recent["MA20"].shift(1))
        if golden.any():
            score += 12
        elif dead.any():
            score -= 12

    # Volume trend (vs 20d avg)
    vol_avg = df["거래량"].tail(20).mean()
    last_vol = last["거래량"]
    if vol_avg > 0:
        vol_ratio = last_vol / vol_avg
        if vol_ratio > 1.5:
            score += 5
        elif vol_ratio < 0.5:
            score -= 3

    # ADX (trend strength): if strong trend, amplify existing direction
    adx = last.get("ADX", float("nan"))
    if not pd.isna(adx) and adx > 25:
        direction = 1 if score >= 50 else -1
        score += direction * 5

    # Bollinger Bands: oversold(하단 이탈) / overbought(상단 돌파)
    bb_upper = last.get("BB_upper", float("nan"))
    bb_lower = last.get("BB_lower", float("nan"))
    if not (pd.isna(bb_upper) or pd.isna(bb_lower) or pd.isna(close)):
        if close < bb_lower:
            score += 8   # 볼린저 하단 이탈 → 과매도 반등 가능성
        elif close > bb_upper:
            score -= 8   # 볼린저 상단 돌파 → 과매수 주의

    # OBV trend (최근 5일 OBV 기울기)
    obv_col = "OBV" if "OBV" in df.columns else None
    if obv_col:
        obv_recent = df[obv_col].tail(5).dropna()
        if len(obv_recent) >= 3:
            obv_slope = (obv_recent.iloc[-1] - obv_recent.iloc[0]) / max(abs(obv_recent.iloc[0]), 1)
            if obv_slope > 0.02:
                score += 5   # OBV 상승 → 매집 신호
            elif obv_slope < -0.02:
                score -= 5   # OBV 하락 → 분산 신호

    return float(max(0.0, min(100.0, score)))


# ---------------------------------------------------------------------------
# YouTube score (0–100)
# ---------------------------------------------------------------------------

def _calc_yt_score(
    ticker: str,
    stock_name: str,
) -> tuple[float, int, float, list[str], str | None, str | None, bool]:
    """Returns (yt_score, mentions, sentiment_ratio, key_signals, urgency, trading_type, no_data)"""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=YT_LOOKBACK_DAYS)).isoformat()

    rows = (
        supabase.table("youtube_insights")
        .select("market_sentiment,key_stocks,key_stocks_sentiment,investment_signals,urgency,trading_type")
        .gte("upload_date", cutoff[:10])
        .order("upload_date", desc=True)
        .limit(100)
        .execute()
    )

    mention_count = 0
    positive_count = 0
    negative_count = 0
    neutral_count = 0
    key_signals: list[str] = []
    urgency_votes: dict[str, int] = {}
    type_votes: dict[str, int] = {}

    aliases: set[str] = {stock_name}
    for alias, t in (_alias_cache or {}).items():
        if t == ticker:
            aliases.add(alias)

    for row in rows.data or []:
        ks = row.get("key_stocks") or []
        if isinstance(ks, str):
            try:
                ks = json.loads(ks)
            except Exception:
                ks = []

        matched = any(k in aliases for k in ks)
        if not matched:
            continue

        mention_count += 1

        # Sentiment for this stock specifically
        ks_sentiment = row.get("key_stocks_sentiment") or {}
        if isinstance(ks_sentiment, str):
            try:
                ks_sentiment = json.loads(ks_sentiment)
            except Exception:
                ks_sentiment = {}

        sentiment = None
        for k in ks:
            if k in aliases and k in ks_sentiment:
                sentiment = ks_sentiment[k]
                break
        if sentiment is None:
            sentiment = row.get("market_sentiment", "중립")

        if "긍정" in str(sentiment):
            positive_count += 1
        elif "부정" in str(sentiment):
            negative_count += 1
        else:
            neutral_count += 1

        # Extract investment_signals text
        inv_signals = row.get("investment_signals")
        if inv_signals:
            if isinstance(inv_signals, str):
                try:
                    inv_signals = json.loads(inv_signals)
                except Exception:
                    inv_signals = None
            if isinstance(inv_signals, list):
                for sig in inv_signals:
                    text = sig if isinstance(sig, str) else sig.get("signal", "") if isinstance(sig, dict) else ""
                    if text and len(key_signals) < 5:
                        key_signals.append(str(text)[:200])
            elif isinstance(inv_signals, dict):
                text = inv_signals.get("signal") or inv_signals.get("action") or ""
                if text and len(key_signals) < 5:
                    key_signals.append(str(text)[:200])

        # Urgency / trading type votes
        urgency = row.get("urgency")
        if urgency:
            urgency_votes[str(urgency)] = urgency_votes.get(str(urgency), 0) + 1
        ttype = row.get("trading_type")
        if ttype:
            type_votes[str(ttype)] = type_votes.get(str(ttype), 0) + 1

    if mention_count == 0:
        return 50.0, 0, 0.5, [], None, None, True

    # 중립도 분모에 포함해야 실제 긍정 비율이 정확해짐
    total_sentiment = positive_count + negative_count + neutral_count
    sentiment_ratio = positive_count / total_sentiment if total_sentiment > 0 else 0.5

    # Base score from sentiment
    score = 50.0 + (sentiment_ratio - 0.5) * 60  # range: 20–80

    # Mention frequency boost (more mentions = stronger signal)
    if mention_count >= 5:
        score += 10
    elif mention_count >= 3:
        score += 5

    # Urgency boost: TODAY → buy urgency suggests near-term momentum
    top_urgency = max(urgency_votes, key=urgency_votes.get) if urgency_votes else None
    if top_urgency and "오늘" in top_urgency:
        score = min(score + 8, 95)

    top_type = max(type_votes, key=type_votes.get) if type_votes else None

    return (
        float(max(0.0, min(100.0, score))),
        mention_count,
        round(sentiment_ratio, 3),
        key_signals,
        top_urgency,
        top_type,
        False,
    )


# ---------------------------------------------------------------------------
# Factor score (0–100) from factor_scores table
# ---------------------------------------------------------------------------

def _load_factor_scores() -> dict[str, float]:
    rows = (
        supabase.table("factor_scores")
        .select("ticker,composite_score")
        .execute()
    )
    return {
        row["ticker"]: float(row["composite_score"])
        for row in (rows.data or [])
        if row.get("composite_score") is not None
    }


def _normalize_factor_score(raw: float, all_scores: list[float]) -> float:
    if not all_scores:
        return 50.0
    min_s, max_s = min(all_scores), max(all_scores)
    if max_s == min_s:
        return 50.0
    return float((raw - min_s) / (max_s - min_s) * 100)


# ---------------------------------------------------------------------------
# News score (0–100) from stock_news table
# ---------------------------------------------------------------------------

_NEWS_SIGNAL_MAP = {
    # Claude 실제 반환값 (news_collector 프롬프트 기준)
    "매수관심": 78, "관망": 50, "주의": 22,
    # 레거시 값 (구버전 데이터 호환)
    "강력매수": 90, "매수": 75, "약매수": 62,
    "중립": 50,
    "약매도": 38, "매도": 25, "강력매도": 10,
}
_NEWS_SENTIMENT_MAP = {
    # Claude 실제 반환값
    "호재": 75, "중립": 50, "악재": 25,
    # 레거시 값
    "긍정": 70, "부정": 30,
}


def _load_investor_flow() -> dict[str, list[dict]]:
    """stock_news.investor_data에서 수급 일별 데이터 로드 → {stock_code: [day_data, ...]}"""
    try:
        resp = (
            supabase.table("stock_news")
            .select("stock_code,investor_data")
            .order("collected_at", desc=True)
            .limit(300)
            .execute()
        )
        flow_map: dict[str, list] = {}
        for row in resp.data or []:
            code = row.get("stock_code", "")
            if not code or code in flow_map:
                continue
            inv = row.get("investor_data") or []
            if isinstance(inv, str):
                try:
                    inv = json.loads(inv)
                except Exception:
                    inv = []
            if inv:
                flow_map[code] = inv
        return flow_map
    except Exception as e:
        print(f"  [investor_flow 로드 실패] {e}")
        return {}


def _investor_streak(days: list[dict], key: str) -> int:
    """연속 순매수(양수)/순매도(음수) 일수. 오래된→최근 정렬 기준 최신에서 역산."""
    if not days:
        return 0
    direction = 1 if days[0].get(key, 0) > 0 else -1
    streak = 0
    for d in days:
        val = d.get(key, 0)
        if direction > 0 and val > 0:
            streak += 1
        elif direction < 0 and val < 0:
            streak += 1
        else:
            break
    return streak * direction


def _investor_timing_boost(flow_days: list[dict]) -> float:
    """
    외국인/기관 연속 수급 신호 → timing score 가감 (최대 ±18).
    외국인 5일↑: ±10, 3~4일: ±5
    기관    5일↑: ±7,  3~4일: ±3
    외국인+기관 동시 5일↑ 같은 방향: 추가 ±5
    """
    if not flow_days:
        return 0.0
    f_streak = _investor_streak(flow_days, "foreign_net")
    i_streak = _investor_streak(flow_days, "institution_net")

    boost = 0.0
    f_sign = 1 if f_streak > 0 else -1
    i_sign = 1 if i_streak > 0 else -1

    if abs(f_streak) >= 5:
        boost += 10.0 * f_sign
    elif abs(f_streak) >= 3:
        boost += 5.0 * f_sign

    if abs(i_streak) >= 5:
        boost += 7.0 * i_sign
    elif abs(i_streak) >= 3:
        boost += 3.0 * i_sign

    # 외국인+기관 동시 5일 이상, 같은 방향 → 추가 boost
    if abs(f_streak) >= 5 and abs(i_streak) >= 5 and f_sign == i_sign:
        boost += 5.0 * f_sign

    return boost


def _load_news_scores() -> dict[str, float]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    rows = (
        supabase.table("stock_news")
        .select("stock_code,sentiment,trading_signal,news_impact_score")
        .gte("collected_at", cutoff)
        .order("collected_at", desc=True)
        .limit(500)
        .execute()
    )
    # Keep only most recent per ticker
    seen: set[str] = set()
    scores: dict[str, float] = {}
    for row in rows.data or []:
        code = row.get("stock_code", "")
        if not code or code in seen:
            continue
        seen.add(code)

        ts = _NEWS_SIGNAL_MAP.get(str(row.get("trading_signal") or ""), None)
        ss = _NEWS_SENTIMENT_MAP.get(str(row.get("sentiment") or ""), 50)
        imp = row.get("news_impact_score")

        if ts is not None:
            base = ts * 0.6 + ss * 0.4
        else:
            base = float(ss)

        if imp is not None:
            try:
                base = base * 0.7 + float(imp) * 0.3
            except (TypeError, ValueError):
                pass

        scores[code] = round(base, 2)
    return scores


# ---------------------------------------------------------------------------
# Market regime (hysteresis)
# ---------------------------------------------------------------------------

def _calc_market_regime(current_regime: str) -> str:
    """다중 지표 기반 시장 국면 탐지 (STRONG_BULL/BULL/NEUTRAL/BEAR 4단계).

    각 지표별 bull/bear 조건을 독립 집계 → 우세 방향 결정:
    1. YouTube 감성 비율
    2. KOSPI MA20 위치 (sector_index_history — yfinance 의존 제거)
    3. 외국인 5일 순매수
    4. 뉴스 감성 비율
    """
    bear_signals = 0
    bull_signals = 0

    # ── 지표 1: YouTube 감성 ──────────────────────────────────────
    cutoff = (datetime.now(timezone.utc) - timedelta(days=YT_LOOKBACK_DAYS)).isoformat()
    yt_rows = (
        supabase.table("youtube_insights")
        .select("market_sentiment")
        .gte("upload_date", cutoff[:10])
        .limit(200)
        .execute()
    )
    sentiments = [r.get("market_sentiment", "") for r in (yt_rows.data or [])]
    if sentiments:
        yt_neg_ratio = sum(1 for s in sentiments if "부정" in str(s)) / len(sentiments)
        if yt_neg_ratio >= BEAR_ENTRY_THRESHOLD:   # >= 0.60
            bear_signals += 1
        elif yt_neg_ratio <= 0.25:
            bull_signals += 1

    # ── 지표 2: KOSPI MA20 위치 (Supabase sector_index_history) ───
    try:
        kospi_rows = (
            supabase.table("sector_index_history")
            .select("trade_date,close_index")
            .eq("sector_code", "0001")
            .order("trade_date", desc=True)
            .limit(25)
            .execute()
        )
        closes = [r["close_index"] for r in (kospi_rows.data or []) if r.get("close_index")][::-1]
        if len(closes) >= 20:
            ma20 = sum(closes[-20:]) / 20
            if closes[-1] < ma20:
                bear_signals += 1
            elif closes[-1] > ma20 * 1.02:
                bull_signals += 1
    except Exception:
        pass

    # ── 지표 3: 외국인 5일 순매수 ────────────────────────────────
    try:
        news_rows = (
            supabase.table("stock_news")
            .select("investor_data")
            .order("collected_at", desc=True)
            .limit(50)
            .execute()
        )
        total_foreign_5d = 0
        count = 0
        for row in (news_rows.data or []):
            inv = row.get("investor_data", [])
            if isinstance(inv, str):
                try: inv = __import__("json").loads(inv)
                except: inv = []
            if inv:
                total_foreign_5d += sum(d.get("foreign_net", 0) for d in inv[:5])
                count += 1
        if count > 0:
            avg_foreign = total_foreign_5d / count
            if avg_foreign < 0:
                bear_signals += 1
            elif avg_foreign > 0:
                bull_signals += 1
    except Exception:
        pass

    # ── 지표 4: 뉴스 감성 ─────────────────────────────────────────
    try:
        news_sent_rows = (
            supabase.table("stock_news")
            .select("sentiment")
            .order("collected_at", desc=True)
            .limit(100)
            .execute()
        )
        sentiments_news = [r.get("sentiment", "") for r in (news_sent_rows.data or [])]
        if sentiments_news:
            news_neg = sum(1 for s in sentiments_news if "악재" in str(s)) / len(sentiments_news)
            if news_neg > 0.50:
                bear_signals += 1
            elif news_neg < 0.30:
                bull_signals += 1
    except Exception:
        pass

    # ── 국면 결정 (bear 우선, 히스테리시스) ───────────────────────
    # Bear: 3개 이상 또는 이미 BEAR이면 2개로 유지
    if bear_signals >= 3:
        return "BEAR"
    if current_regime == "BEAR" and bear_signals >= 2:
        return "BEAR"

    # Bull: bear 신호 1개 이하일 때만 진입
    if bull_signals >= 4 and bear_signals == 0:
        return "STRONG_BULL"
    if bull_signals >= 3 and bear_signals <= 1:
        return "BULL"
    if current_regime in ("BULL", "STRONG_BULL") and bull_signals >= 2 and bear_signals <= 1:
        return "BULL"

    return "NEUTRAL"


# ---------------------------------------------------------------------------
# Signal decision
# ---------------------------------------------------------------------------

def _score_to_signal(composite: float) -> str:
    if composite >= 65:
        return "BUY"
    if composite <= 35:
        return "SELL"
    return "HOLD"


def _calc_signal_agreement(tech: float, yt: float, yt_no_data: bool) -> float:
    if yt_no_data:
        return 50.0
    diff = abs(tech - yt)
    # Perfect agreement = same direction, diverge = opposite directions
    agreement = max(0.0, 100.0 - diff * 1.5)
    return round(agreement, 2)


def _apply_agreement_multiplier(composite: float, tech: float, yt: float, yt_no_data: bool) -> float:
    if yt_no_data:
        return composite
    both_bullish = tech >= 55 and yt >= 55
    both_bearish = tech <= 45 and yt <= 45
    if both_bullish or both_bearish:
        deviation = composite - 50
        return min(100.0, max(0.0, 50.0 + deviation * 1.15))
    return composite


# ---------------------------------------------------------------------------
# Data quality
# ---------------------------------------------------------------------------

def _calc_data_quality(
    tech: float | None,
    factor: float | None,
    news: float | None,
    yt_no_data: bool,
    yt_mentions: int,
) -> float:
    components = 0
    score = 0.0
    if tech is not None:
        score += 0.35
        components += 1
    if factor is not None:
        score += 0.25
        components += 1
    if news is not None:
        score += 0.20
        components += 1
    yt_quality = 0.0 if yt_no_data else min(1.0, yt_mentions / 3.0)
    score += yt_quality * 0.20
    return round(score, 3)


# ---------------------------------------------------------------------------
# P1: Weight redistribution composite
# P2: Dynamic thresholds
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# 2-Stage Architecture: Quality Gate (퀀트) × Timing (매매)
#
# Stage 1 — Quality Gate (factor_calculator 결과)
#   "이 종목이 구조적으로 강한가?"
#   A: factor_score ≥ 65 (상위 35%, 모멘텀+수급+가치 우수)
#   B: 40 ≤ factor_score < 65 (중립)
#   C: factor_score < 40 (구조적 취약)
#
# Stage 2 — Timing Signal (tech + news + yt)
#   "지금 들어갈 타이밍인가?"
#   tech 55%, news 25%, yt 20% (factor 제외 — stage 1에서 이미 반영)
#
# Decision Matrix:
#   Quality A + Good timing  → BUY ✅✅  (구조 강 + 타이밍 맞음)
#   Quality A + Bad timing   → HOLD ⏳   (구조 강, 타이밍 기다려)
#   Quality B + Good timing  → BUY (NEUTRAL/BULL 시장만)
#   Quality B + Bad timing   → SELL
#   Quality C + Any timing   → HOLD/SELL (구조 약, 매수 금지)
#
# Market Regime:
#   BULL: 진입 기준 완화 (Quality B도 BUY 가능)
#   BEAR: 진입 기준 강화 (Quality A만 BUY, 나머지 HOLD→SELL)
# ---------------------------------------------------------------------------

_TIMING_WEIGHTS: dict[str, float] = {"tech": 0.50, "news": 0.22, "yt": 0.18, "analyst": 0.10}
_COMPOSITE_WEIGHTS: dict[str, float] = {"quality": 0.40, "timing": 0.60}


def _load_analyst_scores() -> dict[str, list[dict]]:
    """analyst_targets에서 최근 90일 데이터를 종목코드별로 로드."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).date().isoformat()
    try:
        rows = (
            supabase.table("analyst_targets")
            .select("stock_code,firm_name,target_price,upside_pct,direction,rating,report_date")
            .gte("report_date", cutoff)
            .execute()
            .data or []
        )
    except Exception as e:
        print(f"  analyst_targets 로드 실패: {e}")
        return {}
    result: dict[str, list[dict]] = {}
    for r in rows:
        code = r["stock_code"]
        result.setdefault(code, []).append(r)
    return result


def _calc_analyst_score(targets: list[dict]) -> float:
    """증권사 목표가 → 타이밍 점수 0~100.
    recency × consensus × magnitude. 데이터 없으면 50 (중립)."""
    if not targets:
        return 50.0
    today = datetime.now(timezone.utc).date()
    valid = []
    for t in targets:
        try:
            report_dt = date.fromisoformat(str(t["report_date"]))
            days = (today - report_dt).days
            if days <= 90:
                valid.append({**t, "days_old": days})
        except (ValueError, TypeError):
            continue
    if not valid:
        return 50.0

    most_recent = min(v["days_old"] for v in valid)
    recency = math.exp(-most_recent / 30)
    consensus = min(len(valid) / 3, 1.0)

    upsides = [v["upside_pct"] for v in valid if v.get("upside_pct") is not None]
    if upsides:
        median_upside = sorted(upsides)[len(upsides) // 2]
        magnitude = max(0.0, min(1.0, (float(median_upside) - 5) / 25))
    else:
        magnitude = 0.5

    raw = recency * consensus * magnitude * 100

    directions = [v.get("direction", "") for v in valid]
    if directions and sum(1 for d in directions if d == "상향") / len(directions) >= 0.5:
        raw = min(100.0, raw * 1.2)

    ratings = [v.get("rating", "") for v in valid if v.get("rating")]
    if ratings and all(r == "SELL" for r in ratings):
        return 0.0

    return round(raw, 2)


def _quality_tier(factor_score: float | None) -> str:
    """퀀트 팩터 품질 등급 분류."""
    if factor_score is None:
        return "UNKNOWN"
    if factor_score >= 65:
        return "A"   # 구조적으로 강함
    if factor_score >= 40:
        return "B"   # 중립
    return "C"        # 구조적으로 취약


def _calc_timing_score(
    tech_raw: float | None,
    news_score: float | None,
    yt_raw: float,
    yt_no_data: bool,
    analyst_score: float | None = None,
) -> float:
    """타이밍 점수: tech + news + yt + analyst (factor 제외 — stage 1에서 반영)."""
    components = {
        "tech":     tech_raw,
        "news":     news_score,
        "yt":       None if yt_no_data else yt_raw,
        "analyst":  analyst_score,
    }
    available = {k: v for k, v in components.items() if v is not None}
    if not available:
        return 50.0
    total_w = sum(_TIMING_WEIGHTS[k] for k in available)
    return sum(_TIMING_WEIGHTS[k] * v for k, v in available.items()) / total_w


def _two_stage_signal(
    quality_tier: str,
    timing_score: float,
    market_regime: str,
    data_quality: float,
) -> str:
    """2단계 결합 신호 결정."""
    if data_quality < 0.40:
        return "HOLD"  # 데이터 품질 부족

    buy_thr, sell_thr = _REGIME_BUY_SELL.get(market_regime, _REGIME_BUY_SELL["NEUTRAL"])

    good_timing = timing_score >= buy_thr
    bad_timing  = timing_score <= sell_thr

    if quality_tier == "A":
        if good_timing:
            return "BUY"                      # 구조 강 + 타이밍 맞음 ✅
        if bad_timing and market_regime == "BEAR":
            return "SELL"                     # 강세 종목도 약세장엔 매도
        return "HOLD"                         # 타이밍 기다리기 ⏳

    if quality_tier == "B":
        if good_timing and market_regime != "BEAR":
            return "BUY"                      # 중립 종목, 타이밍+시장 모두 좋을 때만
        if bad_timing:
            return "SELL"
        return "HOLD"

    # Quality C (구조 취약)
    if bad_timing:
        return "SELL"
    return "HOLD"                             # 구조 약, 타이밍 좋아도 매수 금지


def _weighted_composite(
    tech_raw: float | None,
    factor_score: float | None,
    news_score: float | None,
    yt_raw: float,
    yt_no_data: bool,
    analyst_score: float | None = None,
) -> float:
    """복합 점수: quality(40%) × timing(60%) 구조."""
    quality_score = factor_score if factor_score is not None else 50.0
    timing_score  = _calc_timing_score(tech_raw, news_score, yt_raw, yt_no_data, analyst_score)
    return (
        _COMPOSITE_WEIGHTS["quality"] * quality_score +
        _COMPOSITE_WEIGHTS["timing"]  * timing_score
    )


def _get_thresholds(data_quality: float) -> tuple[float, float]:
    """데이터 품질 기반 임계값 (레거시 호환용, 실제 신호는 _two_stage_signal 사용)."""
    if data_quality >= 0.75:
        return 65.0, 35.0
    if data_quality >= 0.50:
        return 70.0, 30.0
    return float("inf"), float("-inf")  # force HOLD


# ---------------------------------------------------------------------------
# Main run
# ---------------------------------------------------------------------------

def run() -> None:
    print("\n=== 매매 신호 계산 시작 ===")

    # Load ticker_aliases into cache
    global _alias_cache
    _alias_cache = _build_alias_cache()
    print(f"  ticker_aliases 로드: {len(_alias_cache)}개 매핑")

    # Load supporting data in bulk
    print("  factor_scores 로드...")
    factor_map = _load_factor_scores()
    all_factor_values = list(factor_map.values())
    print(f"    {len(factor_map)}개 종목")

    print("  stock_news 로드...")
    news_map = _load_news_scores()
    print(f"    {len(news_map)}개 종목")

    print("  investor_flow 로드...")
    investor_flow = _load_investor_flow()
    print(f"    {len(investor_flow)}개 종목 수급 데이터")

    print("  analyst_targets 로드...")
    analyst_map = _load_analyst_scores()
    print(f"    {len(analyst_map)}개 종목 목표가 데이터")

    # Market regime (carry over previous state for hysteresis)
    prev_regime_row = (
        supabase.table("trade_signals")
        .select("market_regime")
        .order("calculated_at", desc=True)
        .limit(1)
        .execute()
    )
    prev_regime = (
        prev_regime_row.data[0]["market_regime"]
        if prev_regime_row.data
        else "NEUTRAL"
    )
    market_regime = _calc_market_regime(prev_regime)
    regime_dampener = 0.80 if market_regime == "BEAR" else 1.0
    print(f"  시장 국면: {market_regime} (dampener={regime_dampener})")

    # Process each ticker that has factor data (scope limiter)
    tickers_in_scope: list[tuple[str, str, str]] = []
    for row in (supabase.table("ticker_aliases").select("ticker,stock_name,sector").execute().data or []):
        tickers_in_scope.append((row["ticker"], row["stock_name"], row.get("sector") or "기타"))

    print(f"  대상 종목: {len(tickers_in_scope)}개")

    results: list[dict] = []
    for i, (ticker, stock_name, sector) in enumerate(tickers_in_scope):
        code = ticker.split(".")[0]
        print(f"  [{i+1:3d}/{len(tickers_in_scope)}] {stock_name}", end=" ... ", flush=True)

        # Tech score (KIS rate-limit은 kis_fetcher 내부에서 처리)
        tech_raw = _calc_tech_score(ticker)

        # YT score
        yt_raw, yt_mentions, yt_ratio, key_signals, urgency, trading_type, yt_no_data = _calc_yt_score(
            ticker, stock_name
        )

        # Factor score
        factor_raw = factor_map.get(ticker)
        factor_score = (
            _normalize_factor_score(factor_raw, all_factor_values)
            if factor_raw is not None
            else None
        )

        # News score
        news_score = news_map.get(code)

        # Analyst score
        analyst_targets = analyst_map.get(code, [])
        analyst_score: float | None = _calc_analyst_score(analyst_targets) if analyst_targets else None

        # Data quality
        data_quality = _calc_data_quality(tech_raw, factor_score, news_score, yt_no_data, yt_mentions)

        # Stage 1: Quality tier (퀀트 팩터)
        q_tier = _quality_tier(factor_score)

        # Stage 2: Timing score (기술적 + 감성 + 수급 + 애널리스트)
        tech_filled = tech_raw if tech_raw is not None else 50.0
        timing = _calc_timing_score(tech_raw, news_score, yt_raw, yt_no_data, analyst_score)

        # 외국인/기관 연속 수급 boost (±최대 18점)
        flow_days = investor_flow.get(code, [])
        inv_boost = _investor_timing_boost(flow_days)
        if inv_boost != 0.0:
            timing = min(100.0, max(0.0, timing + inv_boost))

        # 연속 수급 스트릭 (로그용)
        f_streak = _investor_streak(flow_days, "foreign_net") if flow_days else 0
        i_streak = _investor_streak(flow_days, "institution_net") if flow_days else 0

        # 2-Stage signal decision
        signal = _two_stage_signal(q_tier, timing, market_regime, data_quality)

        # Composite score: quality(40%) + timing(60%) — 두 차원 모두 반영
        composite = _weighted_composite(tech_raw, factor_score, news_score, yt_raw, yt_no_data, analyst_score)
        composite = round(min(100.0, max(0.0, composite)), 2)

        agreement = _calc_signal_agreement(tech_filled, yt_raw, yt_no_data)

        row_data = {
            "ticker": ticker,
            "stock_name": stock_name,
            "sector": sector,
            "signal": signal,
            "composite_score": composite,
            "signal_version": SIGNAL_VERSION,
            "tech_score": round(tech_raw, 2) if tech_raw is not None else None,
            "yt_score": round(yt_raw, 2),
            "factor_score": round(factor_score, 2) if factor_score is not None else None,
            "news_score": round(news_score, 2) if news_score is not None else None,
            "signal_agreement": agreement,
            "market_regime": market_regime,
            "yt_mentions": yt_mentions,
            "yt_sentiment_ratio": yt_ratio,
            "key_yt_signals": key_signals,
            "urgency": urgency,
            "trading_type": trading_type,
            "data_quality_score": data_quality,
            "yt_no_data": yt_no_data,
            "analyst_score": round(analyst_score, 2) if analyst_score is not None else None,
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        }
        results.append(row_data)
        streak_label = ""
        if abs(f_streak) >= 3:
            streak_label += f" F{f_streak:+d}d"
        if abs(i_streak) >= 3:
            streak_label += f" I{i_streak:+d}d"
        print(f"{signal} ({composite:.1f}) [Q{q_tier} tech={tech_filled:.0f} timing={timing:.0f} yt={yt_raw:.0f} q={data_quality:.2f}{streak_label}]")

    # Upsert to trade_signals
    print(f"\n  trade_signals upsert: {len(results)}개...")
    batch_size = 50
    for i in range(0, len(results), batch_size):
        batch = results[i : i + batch_size]
        supabase.table("trade_signals").upsert(batch, on_conflict="ticker").execute()

    # Also update prediction_log with latest composite/tech/yt/news scores
    _update_prediction_log(results)

    buy_count = sum(1 for r in results if r["signal"] == "BUY")
    sell_count = sum(1 for r in results if r["signal"] == "SELL")
    print(f"\n=== 완료: BUY {buy_count}개 / SELL {sell_count}개 / HOLD {len(results)-buy_count-sell_count}개 ===")


def _update_prediction_log(results: list[dict]) -> None:
    """Upsert today's 0-100 signal scores into prediction_log.

    Bug fixes vs original:
    - Uses KST date (was UTC → always 1 day off during morning run)
    - Creates rows for stocks not yet in prediction_log (was silently skipped)
    - Batch upsert: 3-4 DB calls instead of 156 individual queries
    """
    KST = timezone(timedelta(hours=9))
    today = datetime.now(KST).date().isoformat()

    # Single query to get all existing tickers for today
    try:
        existing = (
            supabase.table("prediction_log")
            .select("ticker")
            .eq("date", today)
            .execute()
        )
        existing_tickers = {row["ticker"] for row in (existing.data or [])}
    except Exception:
        existing_tickers = set()

    # Build upsert rows — always include predicted_up/probability so the
    # ON CONFLICT update is complete (avoids partial-upsert ambiguity)
    upsert_rows = []
    for r in results:
        composite = r.get("composite_score") or 0.0
        upsert_rows.append({
            "date": today,
            "ticker": r["ticker"],
            "predicted_up": r.get("signal") == "BUY",
            "probability": round(composite / 100.0, 4),
            "tech_score": r.get("tech_score"),
            "yt_score": r.get("yt_score"),
            "news_score": r.get("news_score"),
            "composite_score": composite,
        })

    # Batch upsert (156 rows → 3-4 DB calls)
    for i in range(0, len(upsert_rows), 50):
        batch = upsert_rows[i : i + 50]
        try:
            supabase.table("prediction_log").upsert(
                batch, on_conflict="date,ticker"
            ).execute()
        except Exception:
            pass


if __name__ == "__main__":
    run()
