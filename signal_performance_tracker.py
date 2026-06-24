"""
signal_performance_tracker.py
Fills D+1/D+3/D+5/D+10 actual returns for BUY/SELL signals in signal_performance.

Run daily after signal_aggregator.py:
  python signal_performance_tracker.py

Flow:
  1. Find rows where close_1d IS NULL and signal_date <= today - 2 days (D+1 ready)
  2. Find rows where close_5d IS NULL and signal_date <= today - 7 days (D+5 ready)
  3. Fetch stock_prices and compute returns + hit_tp/hit_sl/max_drawdown
  4. Upsert back to signal_performance
"""
from __future__ import annotations

import os
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Calendar-day approximations for trading days
LOOKBACK_1D  = 2   # ~1 trading day
LOOKBACK_3D  = 4   # ~3 trading days
LOOKBACK_5D  = 7   # ~5 trading days
LOOKBACK_10D = 14  # ~10 trading days


def _get_price_after(ticker: str, from_date: date, days: int) -> float | None:
    """Return first available close price on or after from_date + days."""
    target = (from_date + timedelta(days=days)).isoformat()
    rows = (
        supabase.table("stock_prices")
        .select("close")
        .eq("ticker", ticker)
        .gte("trade_date", target)
        .order("trade_date")
        .limit(1)
        .execute()
    )
    r = (rows.data or [None])[0]
    return float(r["close"]) if r and r.get("close") else None


def _get_prices_range(ticker: str, from_date: date, days: int) -> list[float]:
    """Return all close prices within [from_date, from_date + days]."""
    end = (from_date + timedelta(days=days)).isoformat()
    rows = (
        supabase.table("stock_prices")
        .select("close")
        .eq("ticker", ticker)
        .gte("trade_date", from_date.isoformat())
        .lte("trade_date", end)
        .order("trade_date")
        .execute()
    )
    return [float(r["close"]) for r in (rows.data or []) if r.get("close")]


def _update_early_returns(today: date) -> int:
    """Fill close_1d / close_3d for rows ready but not yet computed."""
    cutoff_1d = (today - timedelta(days=LOOKBACK_1D)).isoformat()

    pending = (
        supabase.table("signal_performance")
        .select("id,signal_date,ticker,entry_price")
        .is_("close_1d", "null")
        .lte("signal_date", cutoff_1d)
        .order("signal_date")
        .limit(300)
        .execute()
    )
    rows = pending.data or []
    if not rows:
        return 0

    print(f"  [D+1/D+3] {len(rows)}건 업데이트 중...")
    updated = 0
    for row in rows:
        sig_date = date.fromisoformat(str(row["signal_date"]))
        ticker   = row["ticker"]
        entry    = float(row["entry_price"]) if row.get("entry_price") else None
        if not entry:
            continue

        close_1d = _get_price_after(ticker, sig_date, LOOKBACK_1D)
        close_3d = _get_price_after(ticker, sig_date, LOOKBACK_3D)

        if close_1d is None:
            continue

        payload: dict = {
            "close_1d":  int(close_1d) if close_1d else None,
            "return_1d": round((close_1d - entry) / entry * 100, 2) if close_1d else None,
            "close_3d":  int(close_3d) if close_3d else None,
            "return_3d": round((close_3d - entry) / entry * 100, 2) if close_3d else None,
        }
        supabase.table("signal_performance").update(payload).eq("id", row["id"]).execute()
        updated += 1

    return updated


def _update_full_returns(today: date) -> int:
    """Fill close_5d / close_10d / hit_tp / hit_sl / max_drawdown for matured rows."""
    cutoff_5d = (today - timedelta(days=LOOKBACK_5D)).isoformat()

    pending = (
        supabase.table("signal_performance")
        .select("id,signal_date,ticker,entry_price,take_profit_pct,stop_loss_pct")
        .is_("close_5d", "null")
        .lte("signal_date", cutoff_5d)
        .order("signal_date")
        .limit(200)
        .execute()
    )
    rows = pending.data or []
    if not rows:
        return 0

    print(f"  [D+5/D+10] {len(rows)}건 업데이트 중...")
    updated = 0
    for row in rows:
        sig_date = date.fromisoformat(str(row["signal_date"]))
        ticker   = row["ticker"]
        entry    = float(row["entry_price"]) if row.get("entry_price") else None
        tp_pct   = float(row["take_profit_pct"]) if row.get("take_profit_pct") else None
        sl_pct   = float(row["stop_loss_pct"])   if row.get("stop_loss_pct")   else None

        if not entry:
            continue

        close_5d  = _get_price_after(ticker, sig_date, LOOKBACK_5D)
        close_10d = _get_price_after(ticker, sig_date, LOOKBACK_10D)

        if close_5d is None:
            continue

        ret_5d  = round((close_5d  - entry) / entry * 100, 2)
        ret_10d = round((close_10d - entry) / entry * 100, 2) if close_10d else None

        prices_10d = _get_prices_range(ticker, sig_date, LOOKBACK_10D)
        max_dd = None
        hit_tp = None
        hit_sl = None
        if prices_10d:
            lows = [(p - entry) / entry * 100 for p in prices_10d]
            max_dd = round(min(lows), 2)
            if tp_pct and sl_pct:
                tp_price = entry * (1 + tp_pct / 100)
                sl_price = entry * (1 - sl_pct / 100)
                hit_tp = any(p >= tp_price for p in prices_10d)
                hit_sl = any(p <= sl_price for p in prices_10d)

        payload = {
            "close_5d":         int(close_5d)  if close_5d  else None,
            "close_10d":        int(close_10d) if close_10d else None,
            "return_5d":        ret_5d,
            "return_10d":       ret_10d,
            "max_drawdown_10d": max_dd,
            "hit_take_profit":  hit_tp,
            "hit_stop_loss":    hit_sl,
        }
        supabase.table("signal_performance").update(payload).eq("id", row["id"]).execute()
        print(f"    {sig_date} {ticker}: 5d={ret_5d:+.1f}%{f', 10d={ret_10d:+.1f}%' if ret_10d else ''}")
        updated += 1

    return updated


def run() -> None:
    today = date.today()
    print("=== signal_performance 업데이트 시작 ===")

    n1 = _update_early_returns(today)
    n5 = _update_full_returns(today)

    total = n1 + n5
    if total == 0:
        print("  업데이트할 항목 없음")
    else:
        print(f"=== 완료: D+1/D+3 {n1}건, D+5/D+10 {n5}건 ===")


if __name__ == "__main__":
    run()
