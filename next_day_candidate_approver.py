"""
next_day_candidate_approver.py

아침 08:30 KST 실행. 전일 PENDING 후보를 최종 승인/탈락 처리한다.

승인 기준:
  1. 시장 위험도 (market_risk_level) — EXTREME이면 전량 REJECTED
  2. execution_signal — 오늘 아침 기준도 여전히 BUY_OK/BUY_SMALL인지 확인
  3. 공시/리스크 플래그 재확인 (risk_flags에 "공시" 포함 시 REJECTED)
  4. close_hold_score 기준 미달 (< 50) 시 REJECTED

갭 과열 체크 (시초가 +7% 이상):
  장 시작 후 별도 확인이 필요하므로 여기서는 판단하지 않는다.
  UI에서 실시간 가격과 비교해 사용자가 직접 확인하는 구조.
"""

from __future__ import annotations

import os
from datetime import date, timedelta
from typing import Any

from supabase import create_client

_supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"],
)

# 점수 기준
MIN_CLOSE_HOLD_SCORE = 50.0


def _get_current_market_risk() -> str:
    """현재 시장 위험도 조회 (최신 trade_signals 기준)."""
    res = (
        _supabase.table("trade_signals")
        .select("market_risk_level")
        .order("calculated_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0]["market_risk_level"] if rows else "UNKNOWN"


def _get_current_buy_tickers() -> set[str]:
    """현재 execution_signal이 BUY_OK/BUY_SMALL인 ticker 집합."""
    res = (
        _supabase.table("trade_signals")
        .select("ticker")
        .in_("execution_signal", ["BUY_OK", "BUY_SMALL"])
        .execute()
    )
    return {r["ticker"] for r in (res.data or [])}


def _get_execution_signal(ticker: str) -> str | None:
    """특정 종목의 현재 execution_signal 조회."""
    res = (
        _supabase.table("trade_signals")
        .select("execution_signal,composite_score")
        .eq("ticker", ticker)
        .order("calculated_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0]["execution_signal"] if rows else None


def _approve_candidate(candidate: dict[str, Any]) -> tuple[str, str | None, str | None]:
    """
    단일 후보에 대해 APPROVED / REJECTED 판정.

    Returns:
        (new_status, final_execution_signal, rejection_reason)
    """
    ticker = candidate["ticker"]
    chs = candidate.get("close_hold_score") or 0.0
    risk_flags = candidate.get("risk_flags") or []

    # 1. 공시 리스크 재확인
    if any("공시" in f for f in risk_flags):
        return "REJECTED", None, "공시 리스크 존재"

    # 2. 점수 미달
    if chs < MIN_CLOSE_HOLD_SCORE:
        return "REJECTED", None, f"종가 버팀 점수 미달 ({chs}점)"

    # 3. 오늘 아침 execution_signal 확인
    current_sig = _get_execution_signal(ticker)
    if current_sig not in ("BUY_OK", "BUY_SMALL"):
        return "REJECTED", current_sig, f"아침 신호 변경됨 ({current_sig})"

    return "APPROVED", current_sig, None


def run() -> None:
    """아침 파이프라인 진입점."""
    today = date.today()
    while today.weekday() >= 5:
        today -= timedelta(days=1)

    print(f"\n[아침 최종 승인] target_date={today}")

    # 전일 생성된 PENDING 후보 조회 (target_date = 오늘)
    res = (
        _supabase.table("next_day_candidates")
        .select("id,ticker,stock_name,close_hold_score,next_day_score,risk_flags")
        .eq("target_date", today.isoformat())
        .eq("status", "PENDING")
        .order("next_day_score", desc=True)
        .execute()
    )
    candidates = res.data or []
    print(f"  PENDING 후보: {len(candidates)}개")

    if not candidates:
        print("  처리할 후보 없음")
        return

    # 시장 위험도 전체 체크
    market_risk = _get_current_market_risk()
    print(f"  현재 시장 위험도: {market_risk}")

    if market_risk == "EXTREME":
        # 전량 REJECTED
        for c in candidates:
            _supabase.table("next_day_candidates").update({
                "status":               "REJECTED",
                "final_execution_signal": None,
                "rejection_reason":     "시장 위험도 EXTREME — 전 종목 진입 차단",
                "approved_at":          "now()",
            }).eq("id", c["id"]).execute()
        print(f"  전량 REJECTED (시장 위험도 EXTREME): {len(candidates)}개")
        return

    approved = 0
    rejected = 0

    for c in candidates:
        new_status, final_sig, rej_reason = _approve_candidate(c)

        update_data: dict[str, Any] = {
            "status":               new_status,
            "final_execution_signal": final_sig,
            "rejection_reason":     rej_reason,
            "approved_at":          "now()",
        }

        # HIGH 위험도이면 BUY_OK → BUY_SMALL로 강등
        if new_status == "APPROVED" and market_risk == "HIGH" and final_sig == "BUY_OK":
            update_data["final_execution_signal"] = "BUY_SMALL"
            update_data["rejection_reason"] = "시장 위험도 HIGH — BUY_SMALL로 강등"

        try:
            _supabase.table("next_day_candidates").update(update_data).eq("id", c["id"]).execute()
        except Exception as e:
            print(f"  {c['stock_name']}({c['ticker']}) 업데이트 오류: {e}")
            continue

        if new_status == "APPROVED":
            approved += 1
            sig_label = update_data["final_execution_signal"]
            print(f"  ✅ {c['stock_name']}({c['ticker']}) → {sig_label} (점수 {c['next_day_score']})")
        else:
            rejected += 1
            print(f"  ❌ {c['stock_name']}({c['ticker']}) → {rej_reason}")

    print(f"\n  승인: {approved}개 / 탈락: {rejected}개")
    if approved > 0:
        print("  ※ 시초가 +7% 이상 갭상승 시 추격매수 금지 — 대시보드에서 시초가 확인 필수")
