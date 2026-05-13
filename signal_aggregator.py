"""
signal_aggregator.py — 기술적 신호 + YouTube 인사이트 통합 매매 신호 계산

Scoring weights (Codex review):
  tech   40%  — MA alignment, RSI, MACD, volume
  factor 25%  — factor_scores.composite_score
  news   15%  — stock_news.sentiment / trading_signal
  yt     20%  — youtube_insights (7d window), fallback=50 when no data

Signal agreement multiplier: 1.15x when tech and yt point same direction
Market regime hysteresis: BEAR entry >60%, NEUTRAL re-entry <45%
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
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

SIGNAL_VERSION = 1
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

    total_sentiment = positive_count + negative_count
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
    "강력매수": 90, "매수": 75, "약매수": 62,
    "중립": 50,
    "약매도": 38, "매도": 25, "강력매도": 10,
}
_NEWS_SENTIMENT_MAP = {"긍정": 70, "중립": 50, "부정": 30}


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
    cutoff = (datetime.now(timezone.utc) - timedelta(days=YT_LOOKBACK_DAYS)).isoformat()
    rows = (
        supabase.table("youtube_insights")
        .select("market_sentiment")
        .gte("upload_date", cutoff[:10])
        .limit(200)
        .execute()
    )
    sentiments = [r.get("market_sentiment", "") for r in (rows.data or [])]
    total = len(sentiments)
    if total == 0:
        return current_regime or "NEUTRAL"

    negative_ratio = sum(1 for s in sentiments if "부정" in str(s)) / total

    if current_regime == "BEAR":
        return "BEAR" if negative_ratio >= NEUTRAL_REENTRY_THRESHOLD else "NEUTRAL"
    else:
        return "BEAR" if negative_ratio >= BEAR_ENTRY_THRESHOLD else "NEUTRAL"


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

_WEIGHTS: dict[str, float] = {"tech": 0.40, "factor": 0.25, "news": 0.15, "yt": 0.20}


def _weighted_composite(
    tech_raw: float | None,
    factor_score: float | None,
    news_score: float | None,
    yt_raw: float,
    yt_no_data: bool,
) -> float:
    """Redistribute weights among available signals instead of filling missing with 50."""
    components = {
        "tech":   tech_raw,
        "factor": factor_score,
        "news":   news_score,
        "yt":     None if yt_no_data else yt_raw,
    }
    available = {k: v for k, v in components.items() if v is not None}
    if not available:
        return 50.0
    total_w = sum(_WEIGHTS[k] for k in available)
    return sum(_WEIGHTS[k] * v for k, v in available.items()) / total_w


def _get_thresholds(data_quality: float) -> tuple[float, float]:
    """Return (buy_threshold, sell_threshold) based on data quality."""
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

        # Tech score
        tech_raw = _calc_tech_score(ticker)
        time.sleep(0.15)  # rate-limit yfinance

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

        # Data quality first (needed for dynamic thresholds)
        data_quality = _calc_data_quality(tech_raw, factor_score, news_score, yt_no_data, yt_mentions)

        # P1: Weight redistribution — missing signals excluded, not filled with 50
        composite = _weighted_composite(tech_raw, factor_score, news_score, yt_raw, yt_no_data)

        # Agreement multiplier uses filled value for direction check only
        tech_filled = tech_raw if tech_raw is not None else 50.0
        composite = _apply_agreement_multiplier(composite, tech_filled, yt_raw, yt_no_data)

        # Bear market dampener (pull toward 50)
        if regime_dampener < 1.0:
            composite = 50.0 + (composite - 50.0) * regime_dampener

        composite = round(min(100.0, max(0.0, composite)), 2)

        # P2: Dynamic thresholds — low quality data forces HOLD
        buy_thr, sell_thr = _get_thresholds(data_quality)
        signal = "BUY" if composite >= buy_thr else "SELL" if composite <= sell_thr else "HOLD"
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
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        }
        results.append(row_data)
        print(f"{signal} ({composite:.1f}) [tech={tech_filled:.0f} yt={yt_raw:.0f} q={data_quality:.2f}]")

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
    today = datetime.now(timezone.utc).date().isoformat()
    for r in results:
        try:
            existing = (
                supabase.table("prediction_log")
                .select("id")
                .eq("date", today)
                .eq("ticker", r["ticker"])
                .limit(1)
                .execute()
            )
            if not existing.data:
                continue
            supabase.table("prediction_log").update({
                "tech_score": r.get("tech_score"),
                "yt_score": r.get("yt_score"),
                "news_score": r.get("news_score"),
                "composite_score": r.get("composite_score"),
            }).eq("date", today).eq("ticker", r["ticker"]).execute()
        except Exception:
            pass


if __name__ == "__main__":
    run()
