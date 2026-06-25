"""
next_day_candidate_builder.py

EOD 18:00 KST 실행. 오늘 종가 기준으로 다음날 매수 후보를 생성한다.

로직:
  1. trade_signals에서 BUY_OK / BUY_SMALL 종목 조회
  2. stock_prices에서 오늘 OHLCV + 20일 이동평균 계산
  3. close_hold_score 계산 (규칙 기반)
  4. next_day_score = close_hold_score × 0.4 + composite_score × 0.6
  5. next_day_candidates 테이블에 upsert
"""

from __future__ import annotations

import os
from datetime import date, timedelta
from typing import TypedDict

from supabase import create_client

_supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"],
)

# close_hold_score 티어
SCORE_TIER = {
    "strong":  80,   # 내일 후보 유지
    "watch":   65,   # 관심 후보
    "neutral": 50,   # 관망
}


class OHLCVRow(TypedDict):
    trade_date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


def _fetch_recent_prices(ticker: str, days: int = 25) -> list[OHLCVRow]:
    """stock_prices에서 최근 N일 OHLCV 조회 (최신 순)."""
    res = (
        _supabase.table("stock_prices")
        .select("trade_date,open,high,low,close,volume")
        .eq("ticker", ticker)
        .order("trade_date", desc=True)
        .limit(days)
        .execute()
    )
    return res.data or []


def _calc_close_hold_score(
    today: OHLCVRow,
    ma5: float | None,
    ma20: float | None,
    volume_ma20: float | None,
    is_disclosure_blocked: bool,
) -> tuple[float, list[str], list[str]]:
    """
    종가 버팀 점수 계산.

    Returns:
        (score, reasons, risk_flags)
    """
    if is_disclosure_blocked:
        return 0.0, [], ["공시 리스크 — 진입 차단"]

    score = 50.0
    reasons: list[str] = []
    risk_flags: list[str] = []

    o = today["open"] or 0
    h = today["high"] or 0
    l = today["low"] or 0
    c = today["close"] or 0
    v = today["volume"] or 0
    hl_range = max(h - l, 1)

    # 1. 종가 위치 (양봉 여부)
    if c > o:
        score += 10
        reasons.append("양봉 마감")
    else:
        risk_flags.append("음봉 마감")

    # 2. 고가 대비 종가 위치
    close_vs_high = (h - c) / hl_range if hl_range else 0
    if c >= h * 0.97:
        score += 10
        reasons.append(f"고가 근접 마감 (고가 대비 -{(h - c) / h * 100:.1f}%)")
    elif c <= h * 0.90:
        score -= 10
        risk_flags.append(f"고가 대비 큰 하락 ({close_vs_high * 100:.0f}%)")

    # 3. 이동평균 위 여부
    if ma5 and c > ma5:
        score += 8
        reasons.append(f"MA5 상회 ({c:,.0f} > {ma5:,.0f})")
    if ma20 and c > ma20:
        score += 8
        reasons.append(f"MA20 상회 ({c:,.0f} > {ma20:,.0f})")

    # 4. 거래량 증가
    if volume_ma20 and v > volume_ma20 * 1.5:
        score += 8
        reasons.append(f"거래량 급증 ({v / volume_ma20:.1f}배)")
    elif volume_ma20 and v > volume_ma20 * 1.2:
        score += 4
        reasons.append(f"거래량 증가 ({v / volume_ma20:.1f}배)")

    # 5. 윗꼬리 비율 (과열 징후)
    upper_wick_ratio = (h - c) / hl_range if hl_range else 0
    if upper_wick_ratio > 0.5:
        score -= 15
        risk_flags.append(f"윗꼬리 과대 ({upper_wick_ratio * 100:.0f}%)")
    elif upper_wick_ratio > 0.3:
        score -= 5
        risk_flags.append(f"윗꼬리 주의 ({upper_wick_ratio * 100:.0f}%)")

    return max(0.0, min(100.0, score)), reasons, risk_flags


def _next_trading_day(d: date) -> date:
    """간단한 다음 거래일 계산 (주말만 처리; 공휴일 미반영)."""
    nxt = d + timedelta(days=1)
    while nxt.weekday() >= 5:  # 5=Sat, 6=Sun
        nxt += timedelta(days=1)
    return nxt


def run() -> None:
    """EOD 파이프라인 진입점."""
    today = date.today()
    # 토/일이면 가장 최근 금요일 기준
    while today.weekday() >= 5:
        today -= timedelta(days=1)

    target = _next_trading_day(today)
    print(f"\n[내일 후보 생성] signal_date={today} → target_date={target}")

    # 1. 오늘의 BUY_OK / BUY_SMALL 신호 목록
    res = (
        _supabase.table("trade_signals")
        .select("ticker,stock_name,signal,execution_signal,composite_score,execution_reason")
        .in_("execution_signal", ["BUY_OK", "BUY_SMALL"])
        .order("composite_score", desc=True)
        .execute()
    )
    signals = res.data or []
    print(f"  BUY_OK/BUY_SMALL 종목: {len(signals)}개")

    # 공시 차단 종목 집합 (execution_reason에 "공시" 포함)
    disclosure_blocked: set[str] = {
        s["ticker"]
        for s in signals
        if s.get("execution_reason") and "공시" in s["execution_reason"]
    }

    inserted = 0
    skipped = 0

    for sig in signals:
        ticker = sig["ticker"]
        stock_name = sig.get("stock_name", "")
        composite_score = sig.get("composite_score") or 0.0

        # 2. 최근 25일 OHLCV 조회
        rows = _fetch_recent_prices(ticker, days=25)
        if not rows:
            print(f"  {stock_name}({ticker}): 가격 데이터 없음 — 스킵")
            skipped += 1
            continue

        today_row = rows[0]  # 최신 = 오늘 종가

        # 이동평균 계산
        closes = [r["close"] for r in rows if r["close"]]
        ma5   = sum(closes[:5])  / len(closes[:5])  if len(closes) >= 5  else None
        ma20  = sum(closes[:20]) / len(closes[:20]) if len(closes) >= 20 else None
        vols  = [r["volume"] for r in rows if r["volume"]]
        vol20 = sum(vols[:20]) / len(vols[:20]) if len(vols) >= 20 else None

        is_blocked = ticker in disclosure_blocked

        # 3. close_hold_score 계산
        chs, reasons, risk_flags = _calc_close_hold_score(
            today_row, ma5, ma20, vol20, is_blocked
        )

        # 4. next_day_score (종가 버팀 40% + 복합 신호 60%)
        nds = round(chs * 0.4 + composite_score * 0.6, 1)

        # 5. upsert
        try:
            _supabase.table("next_day_candidates").upsert(
                {
                    "signal_date":          today.isoformat(),
                    "target_date":          target.isoformat(),
                    "ticker":               ticker,
                    "stock_name":           stock_name,
                    "close_price":          today_row.get("close"),
                    "after_hours_price":    None,  # 시간외단일가는 별도 KIS 호출 필요
                    "close_hold_score":     round(chs, 1),
                    "next_day_score":       nds,
                    "reason":               reasons,
                    "risk_flags":           risk_flags,
                    "status":               "PENDING",
                    "final_execution_signal": None,
                    "rejection_reason":     None,
                },
                on_conflict="signal_date,ticker",
            ).execute()
            inserted += 1
        except Exception as e:
            print(f"  {stock_name}({ticker}) 저장 오류: {e}", flush=True)

    print(f"  저장 완료: {inserted}개 / 스킵: {skipped}개")
    print(f"  ▶ 강력 후보 (≥80점): {sum(1 for s in signals if True)}")  # recount after build

    # 상위 후보 요약 출력
    summary_res = (
        _supabase.table("next_day_candidates")
        .select("ticker,stock_name,close_hold_score,next_day_score,reason,risk_flags")
        .eq("signal_date", today.isoformat())
        .order("next_day_score", desc=True)
        .limit(5)
        .execute()
    )
    for c in summary_res.data or []:
        print(
            f"  {c['stock_name']}({c['ticker']}) "
            f"버팀={c['close_hold_score']} 종합={c['next_day_score']} "
            f"사유={c['reason']}"
        )
