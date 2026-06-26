"""
monthly_sniper.py — 월 25일~10일 능동적 스윙 단타 전략

전략 개요:
  - 매달 25일부터 다음달 10일까지 (~10 거래일) 능동적으로 사고팔기
  - 당일 뉴스/유튜브 긍정 신호 + 기술적 진입 → 빠른 매수
  - 목표 +7% 익절 / -5% 손절 / 최대 3일 보유 후 재평가
  - 자금은 재사용 가능 (청산 → 재진입)

실행:
  python monthly_sniper.py           # 오늘 신호 스캔 + 포지션 관리
  python monthly_sniper.py --scan    # 신호 스캔만 (매수 없음)
  python monthly_sniper.py --status  # 현재 포지션 및 PnL 요약
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from dotenv import load_dotenv

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv(Path(__file__).parent / ".env")

import urllib.request

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
KST = timezone(timedelta(hours=9))

_SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# ── 전략 파라미터 ──────────────────────────────────────────────────────────────
BUDGET          = 2_000_000     # 월 투자 예산 (원)
MAX_POSITIONS   = 3             # 동시 최대 보유 종목 수
STOP_LOSS       = -0.05         # 손절 기준 -5% (절대 하드룰)
MIN_SIGNAL_CONF = 0.60          # ML 모델 최소 신뢰도 (60% 이상)
NEAR_LIMIT_PCT  = 0.25          # 상한가 근접 기준 (+25%) → 즉시 전량 익절
PARTIAL_RATIO   = 0.50          # 1차 익절 비율 (50%)

# 촉매 강도별 파라미터: (min_composite, trailing_stop%, first_target%, max_hold_days, label)
# trailing_stop: 고점 대비 이 %이상 하락하면 트레일링 발동
# first_target:  1차 익절(50%) 목표
CATALYST_TIERS: list[tuple[float, float, float, int, str]] = [
    (0.85, 0.10, 0.20, 7, "초강"),   # composite ≥ 0.85: 트레일링 -10%, 익절 +20%, 7일
    (0.70, 0.08, 0.15, 5, "강"),     # composite ≥ 0.70: 트레일링  -8%, 익절 +15%, 5일
    (0.55, 0.06, 0.10, 4, "보통"),   # composite ≥ 0.55: 트레일링  -6%, 익절 +10%, 4일
    (0.00, 0.04, 0.07, 3, "약"),     # composite  < 0.55: 트레일링  -4%, 익절  +7%, 3일
]

# 매달 25일 → 다음달 10일 (스나이퍼 기간)
PERIOD_START_DAY = 25
PERIOD_END_DAY   = 10

# 신호 강도 가중치 (감성 반응 속도 최적화)
SIGNAL_WEIGHTS = {
    "news_today":  0.35,   # 오늘 나온 뉴스 감성 (가장 빠른 신호)
    "yt_today":    0.30,   # 오늘 유튜브 언급 (재료 확인)
    "technical":   0.25,   # 기술적 진입 조건
    "ml_score":    0.10,   # ML 예측 (보조)
}


# ── Supabase 헬퍼 ─────────────────────────────────────────────────────────────
def _encode_params(params: str) -> str:
    """URL 쿼리 파라미터의 값 부분만 인코딩 (=, &, ., ~ 는 유지)."""
    import urllib.parse
    return urllib.parse.quote(params, safe="=&.~*(),-+:@!$'[]")


def _sb_get(table: str, params: str = "") -> list:
    encoded = _encode_params(params) if params else ""
    url = f"{SUPABASE_URL}/rest/v1/{table}?{encoded}"
    req = urllib.request.Request(url, headers=_SB_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"  [Supabase 오류] {e}")
        return []


def _sb_post(table: str, data: dict, on_conflict: str | None = None) -> bool:
    import urllib.parse
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={urllib.parse.quote(on_conflict, safe='')}"
    headers = {**_SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception as e:
        print(f"  [Supabase 저장 오류] {e}")
        return False


def _sb_patch(table: str, filters: dict, data: dict) -> bool:
    query = _encode_params("&".join(f"{k}=eq.{v}" for k, v in filters.items()))
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    headers = {**_SB_HEADERS, "Prefer": "return=minimal"}
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="PATCH")
    try:
        urllib.request.urlopen(req, timeout=10)
        return True
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        print(f"  [Supabase 수정 오류] HTTP {e.code}: {detail}")
        return False
    except Exception as e:
        print(f"  [Supabase 수정 오류] {e}")
        return False


# ── 기간 판단 ──────────────────────────────────────────────────────────────────
def is_sniper_period(today: date | None = None) -> bool:
    """지금이 스나이퍼 기간인지 확인 (25일~다음달 10일)"""
    d = today or datetime.now(KST).date()
    return d.day >= PERIOD_START_DAY or d.day <= PERIOD_END_DAY


def get_period_label(today: date | None = None) -> str:
    d = today or datetime.now(KST).date()
    if d.day >= PERIOD_START_DAY:
        next_month = d.month % 12 + 1
        return f"{d.year}-{d.month:02d} 스나이퍼 ({d.month}월25일~{next_month}월10일)"
    prev_month = d.month - 1 if d.month > 1 else 12
    return f"{d.year}-{d.month:02d} 스나이퍼 ({prev_month}월25일~{d.month}월10일)"


# ── 신호 스캔 ──────────────────────────────────────────────────────────────────
def _get_today_news_signals(today_str: str) -> dict[str, dict]:
    """오늘 날짜 기준 뉴스 감성 신호 수집."""
    rows = _sb_get(
        "stock_news",
        f"collected_at=gte.{today_str}T00:00:00"
        f"&select=stock_name,stock_code,sentiment,trading_signal,news_impact_score"
        f"&order=collected_at.desc&limit=200",
    )
    signals: dict[str, dict] = {}
    for r in rows:
        name = r.get("stock_name", "")
        if not name or name in signals:
            continue
        sentiment = r.get("sentiment", "중립")
        tsignal   = r.get("trading_signal", "관망")
        impact    = r.get("news_impact_score", 0) or 0

        score = 0.0
        if sentiment == "호재":
            score += 0.5
        elif sentiment == "악재":
            score -= 0.5

        if tsignal == "매수관심":
            score += 0.3
        elif tsignal == "주의":
            score -= 0.3

        score += float(impact) / 200   # 0~100 → 0~0.5 가산
        signals[name] = {"score": min(1.0, max(-1.0, score)), "sentiment": sentiment, "signal": tsignal}
    return signals


def _get_today_yt_signals(today_str: str) -> dict[str, float]:
    """최근 3일 유튜브 인사이트에서 종목별 긍정 언급 집계."""
    cutoff = (datetime.now(KST) - timedelta(days=3)).date().isoformat()
    rows = _sb_get(
        "youtube_insights",
        f"upload_date=gte.{cutoff}"
        f"&select=key_stocks,market_sentiment,urgency,trading_type"
        f"&order=processed_at.desc&limit=100",
    )
    mentions: dict[str, list[float]] = {}
    for r in rows:
        stocks    = r.get("key_stocks", []) or []
        sentiment = r.get("market_sentiment", "중립")
        urgency   = r.get("urgency", "이번주")

        # 긴급도 가중치
        urgency_w = 1.5 if urgency == "오늘" else 1.2 if urgency == "이번주" else 1.0
        base = 1.0 if sentiment == "긍정" else -0.5 if sentiment == "부정" else 0.0

        for stock in stocks:
            if stock not in mentions:
                mentions[stock] = []
            mentions[stock].append(base * urgency_w)

    return {name: min(1.0, sum(scores) / max(len(scores), 1))
            for name, scores in mentions.items()}


def _get_technical_scores() -> dict[str, float]:
    """trade_signals 테이블에서 최신 기술적 점수 (0~100) 조회."""
    rows = _sb_get(
        "trade_signals",
        "select=ticker,stock_name,tech_score,composite_score,signal"
        "&order=calculated_at.desc&limit=300",
    )
    seen: set[str] = set()
    result: dict[str, float] = {}
    for r in rows:
        name = r.get("stock_name", "")
        if not name or name in seen:
            continue
        seen.add(name)
        tech = r.get("tech_score") or 50
        comp = r.get("composite_score") or 50
        # 0~100 → 0~1 정규화
        result[name] = (tech * 0.6 + comp * 0.4) / 100
    return result


def _get_ml_scores() -> dict[str, float]:
    """prediction_log에서 ML 확률 점수 조회 (최근 1일)."""
    yesterday = (datetime.now(KST) - timedelta(days=2)).date().isoformat()
    rows = _sb_get(
        "prediction_log",
        f"date=gte.{yesterday}"
        f"&select=ticker,probability"
        f"&order=date.desc&limit=300",
    )
    from stock_list import ALL_STOCKS
    ticker_to_name = {f"{code}.KS" if code in _KOSPI_CODES else f"{code}.KQ": name
                      for name, code in ALL_STOCKS.items()}
    seen: set[str] = set()
    result: dict[str, float] = {}
    for r in rows:
        ticker = r.get("ticker", "")
        if ticker in seen:
            continue
        seen.add(ticker)
        name = ticker_to_name.get(ticker, ticker)
        prob = r.get("probability") or 0.5
        result[name] = float(prob)
    return result


# KOSPI 코드 집합 (ticker suffix 판별용)
_KOSPI_CODES = {
    "005930", "000660", "042700", "058470", "000990", "373220",
    "006400", "247540", "207940", "068270", "000100", "028300",
    "005380", "000270", "035420", "035720", "323410", "259960",
    "105560", "055550", "138040", "066570", "028260", "090430",
    "097950", "009540", "010140", "012450", "079550", "034020",
    "000720", "189300", "277810", "454910",
}


def scan_signals(verbose: bool = True) -> list[dict]:
    """전체 신호 스캔 → 종목별 통합 점수 계산."""
    today_str = datetime.now(KST).date().isoformat()

    if verbose:
        print(f"\n[스나이퍼 신호 스캔] {today_str}")
        print(f"  뉴스 신호 수집...")
    news_signals  = _get_today_news_signals(today_str)

    if verbose:
        print(f"  유튜브 신호 수집...")
    yt_signals    = _get_today_yt_signals(today_str)

    if verbose:
        print(f"  기술적 점수 수집...")
    tech_scores   = _get_technical_scores()
    ml_scores     = _get_ml_scores()

    # 모든 종목 합집합
    all_names = set(news_signals) | set(yt_signals) | set(tech_scores)

    scored: list[dict] = []
    for name in all_names:
        news = news_signals.get(name, {}).get("score", 0.0)
        yt   = yt_signals.get(name, 0.0)
        tech = tech_scores.get(name, 0.5)
        ml   = ml_scores.get(name, 0.5)

        # 가중 합산
        composite = (
            SIGNAL_WEIGHTS["news_today"] * news +
            SIGNAL_WEIGHTS["yt_today"]   * yt   +
            SIGNAL_WEIGHTS["technical"]  * tech +
            SIGNAL_WEIGHTS["ml_score"]   * ml
        )

        # 최소 조건: 뉴스 OR 유튜브 중 하나 이상 긍정 신호 있어야 함
        has_catalyst = news > 0.3 or yt > 0.3
        if not has_catalyst:
            continue

        scored.append({
            "stock_name":   name,
            "composite":    round(composite, 4),
            "news_score":   round(news, 3),
            "yt_score":     round(yt, 3),
            "tech_score":   round(tech, 3),
            "ml_score":     round(ml, 3),
            "sentiment":    news_signals.get(name, {}).get("sentiment", "-"),
            "news_signal":  news_signals.get(name, {}).get("signal", "-"),
            "scan_date":    today_str,
        })

    scored.sort(key=lambda x: x["composite"], reverse=True)

    if verbose:
        print(f"\n  {'종목':12} {'종합':>7} {'뉴스':>6} {'유튜브':>6} {'기술':>6} {'감성'}")
        print("  " + "-" * 55)
        for s in scored[:10]:
            print(f"  {s['stock_name']:12} {s['composite']:>7.3f} "
                  f"{s['news_score']:>6.3f} {s['yt_score']:>6.3f} "
                  f"{s['tech_score']:>6.3f} {s['sentiment']}")

    return scored


# ── 포지션 관리 ──────────────────────────────────────────────────────────────
def get_current_positions(period_label: str) -> list[dict]:
    """현재 열린 스나이퍼 포지션 조회."""
    return _sb_get(
        "sniper_positions",
        f"period=eq.{period_label}&status=eq.open"
        f"&select=*&order=entry_date.desc",
    )


def get_period_pnl(period_label: str) -> dict:
    """기간 전체 PnL 요약."""
    rows = _sb_get(
        "sniper_positions",
        f"period=eq.{period_label}&select=entry_price,exit_price,shares,status,pnl_pct",
    )
    closed = [r for r in rows if r.get("status") != "open"]
    open_  = [r for r in rows if r.get("status") == "open"]

    realized = sum((r.get("pnl_pct") or 0) / 100 *
                   (r.get("entry_price", 0) * r.get("shares", 0))
                   for r in closed)
    trades   = len(closed)
    wins     = sum(1 for r in closed if (r.get("pnl_pct") or 0) > 0)

    return {
        "realized_pnl": round(realized),
        "trades":        trades,
        "win_rate":      f"{wins/trades*100:.0f}%" if trades else "N/A",
        "open_count":    len(open_),
    }


def _get_current_price(stock_code: str) -> float | None:
    """KIS API로 현재가 조회. 실패 시 Naver Mobile API fallback."""
    try:
        from kis_fetcher import get_client as _get_kis
        result = _get_kis().fetch_current_price(stock_code)
        price = result.get("close", 0)
        if price and float(price) > 0:
            return float(price)
    except Exception as e:
        print(f"  [KIS 현재가 실패 {stock_code}] {e}")

    # Naver Mobile API fallback
    try:
        url = f"https://m.stock.naver.com/api/stock/{stock_code}/basic"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        price = float(data.get("closePrice", "0").replace(",", ""))
        return price if price > 0 else None
    except Exception:
        return None


def _get_catalyst_tier(signal_score: float) -> tuple[float, float, int, str]:
    """신호 점수 → (trailing_stop%, first_target%, max_hold_days, label)"""
    for min_score, trail, target, hold, label in CATALYST_TIERS:
        if signal_score >= min_score:
            return trail, target, hold, label
    return 0.04, 0.07, 3, "약"


def _get_current_signals_map() -> dict[str, dict]:
    """trade_signals에서 종목별 최신 신호 조회."""
    rows = _sb_get(
        "trade_signals",
        "select=stock_name,signal,composite_score,tech_score,news_score,yt_score"
        "&order=calculated_at.desc&limit=300",
    )
    seen: set[str] = set()
    result: dict[str, dict] = {}
    for r in rows:
        name = r.get("stock_name", "")
        if not name or name in seen:
            continue
        seen.add(name)
        result[name] = r
    return result


def _get_today_bad_news(today_str: str) -> set[str]:
    """오늘 악재 뉴스가 나온 종목명 집합."""
    rows = _sb_get(
        "stock_news",
        f"collected_at=gte.{today_str}T00:00:00"
        f"&sentiment=eq.악재"
        f"&select=stock_name",
    )
    return {r.get("stock_name", "") for r in rows}


def _eval_exit(
    pos: dict,
    cur_price: float,
    hold_days: int,
    current_signal: dict | None,
    today_bad_news: set[str],
) -> tuple[str | None, str, str]:
    """
    촉매 강도 기반 동적 청산 판단.
    반환: (close_reason, exit_label, urgency)
      urgency: 'sell_now' | 'sell_partial' | 'watch' | 'hold'
    """
    name         = pos["stock_name"]
    entry_p      = pos["entry_price"]
    entry_sig    = float(pos.get("signal_score") or 0.5)
    max_price    = float(pos.get("max_price") or cur_price)
    partial_done = bool(pos.get("partial_exit_done", False))

    pnl_pct = (cur_price - entry_p) / entry_p

    # ── 현재 촉매 점수 ─────────────────────────────────────────────────────
    if current_signal:
        cur_composite = (
            float(current_signal.get("tech_score") or 50) * 0.60 +
            float(current_signal.get("composite_score") or 50) * 0.40
        ) / 100
    else:
        cur_composite = entry_sig * 0.70  # 신호 없으면 진입 신호 70%로 추정

    # 보수적 유효 점수 (진입 vs 현재 중 낮은 값)
    effective_sig = min(entry_sig, cur_composite * 1.10)
    trail_pct, first_target, max_hold, tier = _get_catalyst_tier(effective_sig)

    # ── 1. 손절 (하드룰, 절대 불변) ────────────────────────────────────────
    if pnl_pct <= STOP_LOSS:
        return f"손절 {pnl_pct*100:.1f}%", "🛑 손절", "sell_now"

    # ── 2. 악재 뉴스 (보유 1일 이상) ──────────────────────────────────────
    if name in today_bad_news and hold_days >= 1:
        return f"악재 뉴스 ({hold_days}일 보유)", "📰 악재", "sell_now"

    # ── 3. 신호 반전 SELL ──────────────────────────────────────────────────
    if current_signal and current_signal.get("signal") == "SELL":
        return "신호 반전 SELL", "🔴 매도 신호", "sell_now"

    # ── 4. 상한가 근접 (+25% 이상) → 즉시 전량 익절 ───────────────────────
    if pnl_pct >= NEAR_LIMIT_PCT:
        return (
            f"상한가 근접 +{pnl_pct*100:.1f}%",
            "🚀 상한가 익절",
            "sell_now",
        )

    # ── 5. 1차 부분 익절 (50%): first_target 도달 시 ──────────────────────
    if not partial_done and pnl_pct >= first_target:
        return (
            f"1차 익절 {pnl_pct*100:.1f}% [{tier}]",
            f"🎯 1차 익절 50% [{tier}]",
            "sell_partial",
        )

    # ── 6. 트레일링 스탑 (촉매 강도 기반 동적 %) ───────────────────────────
    # first_target의 50% 이상 수익 달성 후부터 활성화
    trail_activate = first_target * 0.50
    if max_price > entry_p * (1 + trail_activate):
        trail_stop = max_price * (1 - trail_pct)
        if cur_price <= trail_stop:
            # 강한 촉매 + 1차 익절 미완료 → 경고만 (아직 수익 충분히 못 챙김)
            if effective_sig >= 0.70 and not partial_done:
                return (
                    None,
                    f"⚠️ 트레일링 근접 [{tier} -{trail_pct*100:.0f}%]",
                    "watch",
                )
            return (
                f"트레일링 -{trail_pct*100:.0f}% [{tier}] "
                f"고점 {max_price:,.0f}→현재 {cur_price:,.0f}",
                "📉 트레일링 청산",
                "sell_now",
            )

    # ── 7. 촉매 소멸 경고 ──────────────────────────────────────────────────
    if cur_composite < entry_sig * 0.50 and hold_days >= 1:
        return None, "⚠️ 촉매 약화 (모니터링)", "watch"

    # ── 8. 만기 청산 ──────────────────────────────────────────────────────
    if hold_days >= max_hold:
        # 촉매 여전히 강하고 수익 중이면 1일 연장 (1회)
        can_extend = (
            cur_composite >= entry_sig * 0.80
            and pnl_pct > 0
            and hold_days < max_hold + 1
        )
        if can_extend:
            return None, f"⏳ {hold_days}일 (촉매 유지 연장 [{tier}])", "watch"
        return (
            f"만기 {hold_days}일 ({pnl_pct*100:+.1f}%, {tier})",
            "⏰ 만기",
            "sell_now",
        )

    # 트레일링 스탑 현재 수준 계산 (UI 표시용)
    if max_price > entry_p * (1 + trail_activate):
        trail_display = f"트레일링 {max_price*(1-trail_pct):,.0f}원"
    else:
        trail_display = f"익절목표 {entry_p*(1+first_target):,.0f}원"

    return None, f"🟢 보유 [{tier}] {trail_display}", "hold"


def manage_positions(period_label: str, dry_run: bool = False) -> None:
    """보유 포지션 점검 → 스마트 매도 판단 (촉매소멸/트레일링/신호반전)."""
    positions = get_current_positions(period_label)
    if not positions:
        print("  보유 포지션 없음")
        return

    today     = datetime.now(KST).date()
    today_str = today.isoformat()
    print(f"\n[포지션 관리] {len(positions)}개 보유 중")

    from stock_list import ALL_STOCKS
    name_to_code    = {name: code for name, code in ALL_STOCKS.items()}
    signal_map      = _get_current_signals_map()
    today_bad_news  = _get_today_bad_news(today_str)

    for pos in positions:
        name       = pos["stock_name"]
        entry_p    = pos["entry_price"]
        entry_date = date.fromisoformat(pos["entry_date"])
        shares     = pos["shares"]
        hold_days  = (today - entry_date).days

        # 현재가 조회
        code = name_to_code.get(name, "")
        cur_price = _get_current_price(code) if code else None

        if cur_price is None:
            print(f"  {name}: 현재가 조회 실패")
            continue

        pnl_pct = (cur_price - entry_p) / entry_p * 100
        pnl_amt = round((cur_price - entry_p) * shares)

        # 최고가 갱신 (트레일링 스탑용)
        prev_max   = pos.get("max_price") or cur_price
        new_max    = max(float(prev_max), cur_price)

        # 매도 판단
        cur_signal = signal_map.get(name)
        close_reason, exit_label, urgency = _eval_exit(
            pos, cur_price, hold_days, cur_signal, today_bad_news
        )

        # 출력
        icon = {"sell_now": "🔴", "sell_partial": "🟠", "watch": "🟡", "hold": "🟢"}[urgency]
        suffix = " → 전량청산" if close_reason and urgency == "sell_now" else \
                 " → 50% 부분익절" if urgency == "sell_partial" else ""
        print(f"  {icon} {name}: {entry_p:,}→{cur_price:,}원 "
              f"({pnl_pct:+.1f}%, {pnl_amt:+,}원, {hold_days}일) {exit_label}{suffix}")

        if urgency == "sell_partial" and not dry_run:
            # 1차 부분 익절 (50%): 잔량 절반으로 줄이고 partial_exit_done = True
            partial_shares = max(1, pos["shares"] // 2)
            remain_shares  = pos["shares"] - partial_shares
            partial_pnl    = round((cur_price - entry_p) * partial_shares)
            _sb_patch(
                "sniper_positions",
                {"id": pos["id"]},
                {
                    "shares":             remain_shares,
                    "partial_exit_done":  True,
                    "partial_exit_price": cur_price,
                    "partial_exit_date":  today_str,
                    "max_price":          new_max,
                    "exit_label":         exit_label,
                    "updated_at":         datetime.now(KST).isoformat(),
                },
            )
            print(f"     → {partial_shares}주 부분 익절 완료 (+{partial_pnl:,}원), "
                  f"잔량 {remain_shares}주 트레일링 継続")

        elif close_reason and not dry_run:
            _sb_patch(
                "sniper_positions",
                {"id": pos["id"]},
                {
                    "status":      "closed",
                    "exit_price":  cur_price,
                    "exit_date":   today_str,
                    "pnl_pct":     round(pnl_pct, 2),
                    "pnl_amount":  pnl_amt,
                    "exit_reason": close_reason,
                    "exit_label":  exit_label,
                    "updated_at":  datetime.now(KST).isoformat(),
                },
            )
        elif not dry_run:
            # 최고가 및 현재 상태 업데이트 (청산 안 해도 매일 갱신)
            _sb_patch(
                "sniper_positions",
                {"id": pos["id"]},
                {
                    "max_price":   new_max,
                    "exit_label":  exit_label,
                    "updated_at":  datetime.now(KST).isoformat(),
                },
            )


def enter_positions(signals: list[dict], period_label: str,
                    dry_run: bool = False) -> None:
    """상위 신호 종목에 진입 (예산/최대보유 고려)."""
    open_pos = get_current_positions(period_label)
    available_slots = MAX_POSITIONS - len(open_pos)

    if available_slots <= 0:
        print(f"\n  최대 보유 종목 수({MAX_POSITIONS})에 도달 — 진입 보류")
        return

    # 임계값 이상 신호만 진입 대상
    ENTRY_THRESHOLD = 0.45
    candidates = [s for s in signals if s["composite"] >= ENTRY_THRESHOLD][:available_slots]

    if not candidates:
        print(f"\n  진입 기준({ENTRY_THRESHOLD}) 충족 종목 없음")
        return

    from stock_list import ALL_STOCKS
    name_to_code = {name: code for name, code in ALL_STOCKS.items()}

    per_stock_budget = BUDGET // MAX_POSITIONS
    today_str = datetime.now(KST).date().isoformat()

    print(f"\n[진입 신호] {len(candidates)}개 종목 (예산 {per_stock_budget:,}원/종목)")
    for s in candidates:
        name = s["stock_name"]
        code = name_to_code.get(name)
        if not code:
            print(f"  {name}: 종목코드 없음 — 스킵")
            continue

        # 이미 보유 중인지 확인
        already = any(p["stock_name"] == name for p in open_pos)
        if already:
            print(f"  {name}: 이미 보유 중 — 스킵")
            continue

        cur_price = _get_current_price(code)
        if not cur_price:
            print(f"  {name}: 현재가 조회 실패")
            continue

        shares = int(per_stock_budget / cur_price)
        if shares <= 0:
            print(f"  {name}: 예산 부족 (현재가 {cur_price:,}원)")
            continue

        cost = shares * cur_price
        print(f"  📈 {'[DRY-RUN] ' if dry_run else ''}매수: {name} "
              f"{shares}주 × {cur_price:,}원 = {cost:,}원 "
              f"(신호 {s['composite']:.3f}, 뉴스={s['sentiment']})")

        if not dry_run:
            _sb_post("sniper_positions", {
                "period":       period_label,
                "stock_name":   name,
                "stock_code":   code,
                "entry_date":   today_str,
                "entry_price":  cur_price,
                "shares":       shares,
                "cost":         cost,
                "status":       "open",
                "signal_score": s["composite"],
                "news_score":   s["news_score"],
                "yt_score":     s["yt_score"],
                "exit_price":   None,
                "exit_date":    None,
                "pnl_pct":      None,
                "pnl_amount":   None,
                "exit_reason":  None,
                "updated_at":   datetime.now(KST).isoformat(),
            })


# ── 상태 요약 출력 ────────────────────────────────────────────────────────────
def print_status(period_label: str) -> None:
    """현재 기간 포지션 + PnL 요약."""
    print(f"\n{'='*55}")
    print(f"  스나이퍼 현황: {period_label}")
    print(f"{'='*55}")

    pnl = get_period_pnl(period_label)
    print(f"  실현 PnL:  {pnl['realized_pnl']:+,}원")
    print(f"  거래 횟수: {pnl['trades']}회  승률: {pnl['win_rate']}")
    print(f"  미결 포지션: {pnl['open_count']}개")

    positions = get_current_positions(period_label)
    if positions:
        print(f"\n  [미결 포지션]")
        from stock_list import ALL_STOCKS
        name_to_code = {name: code for name, code in ALL_STOCKS.items()}
        for pos in positions:
            name = pos["stock_name"]
            code = name_to_code.get(name, "")
            cur = _get_current_price(code) if code else None
            entry = pos["entry_price"]
            if cur:
                pnl_pct = (cur - entry) / entry * 100
                icon = "📈" if pnl_pct > 0 else "📉" if pnl_pct < 0 else "⏳"
                print(f"  {icon} {name}: {entry:,}→{cur:,}원 ({pnl_pct:+.1f}%)")
            else:
                print(f"  ⏳ {name}: 진입가 {entry:,}원")

    print(f"{'='*55}\n")


# ── 메인 실행 ──────────────────────────────────────────────────────────────────
def run(dry_run: bool = False, scan_only: bool = False, status_only: bool = False) -> None:
    today = datetime.now(KST).date()
    period = get_period_label(today)

    if status_only:
        print_status(period)
        return

    if not is_sniper_period(today):
        print(f"\n[스나이퍼] 오늘({today})은 전략 기간 아님 (25일~10일만 활성)")
        print(f"  다음 시작: {today.replace(day=PERIOD_START_DAY).isoformat()}")
        return

    print(f"\n{'='*55}")
    print(f"  스나이퍼 전략 실행 [{period}]")
    print(f"  {'DRY-RUN 모드 (실제 저장 안 함)' if dry_run else '실제 실행 모드'}")
    print(f"{'='*55}")

    # 1. 포지션 관리 (익절/손절/만기) — scan_only면 건너뜀
    if not scan_only:
        manage_positions(period, dry_run=dry_run)

    if scan_only:
        # 신호 스캔만 (포지션 관리 없음)
        scan_signals(verbose=True)
        return

    # 2. 오늘 신호 스캔
    signals = scan_signals(verbose=True)

    # 3. 신규 진입
    enter_positions(signals, period, dry_run=dry_run)

    # 4. 현황 요약
    print_status(period)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="스나이퍼 단타 전략")
    parser.add_argument("--scan",     action="store_true", help="신호 스캔만 (진입 없음)")
    parser.add_argument("--status",   action="store_true", help="포지션 현황만 출력")
    parser.add_argument("--dry-run",  action="store_true", help="DRY-RUN (DB 저장 안 함)")
    args = parser.parse_args()

    run(
        dry_run=args.dry_run,
        scan_only=args.scan,
        status_only=args.status,
    )
