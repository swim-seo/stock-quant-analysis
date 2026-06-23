"""
signal_performance_tracker.py
Fills in 5-day and 10-day actual returns for BUY/SELL signals recorded in signal_performance.

Run daily after signal_aggregator.py:
  python signal_performance_tracker.py

Flow:
  1. Find signal_performance rows where close_5d IS NULL and signal_date <= today - 7 days
  2. For each, look up stock_prices to find price 7 and 14 calendar days later
     (approximation for 5 and 10 trading days)
  3. Calculate return_5d, return_10d, hit_take_profit, hit_stop_loss, max_drawdown_10d
  4. Upsert results back to signal_performance
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

LOOKBACK_5D  = 7   # calendar days to approximate 5 trading days
LOOKBACK_10D = 14  # calendar days to approximate 10 trading days


def _get_price_after(ticker: str, from_date: date, days: int) -> float | None:
    """Return first available close price >= from_date + days."""
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


def run() -> None:
    today = date.today()
    cutoff = (today - timedelta(days=LOOKBACK_5D)).isoformat()

    pending = (
        supabase.table("signal_performance")
        .select("id,signal_date,ticker,entry_price,take_profit_pct,stop_loss_pct")
        .is_("close_5d", "null")
        .lte("signal_date", cutoff)
        .order("signal_date")
        .limit(200)
        .execute()
    )
    rows = pending.data or []
    if not rows:
        print("업데이트할 signal_performance 항목 없음")
        return

    print(f"=== signal_performance 업데이트 {len(rows)}건 ===")
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
            continue  # price data not yet available

        ret_5d  = round((close_5d  - entry) / entry * 100, 2) if close_5d  else None
        ret_10d = round((close_10d - entry) / entry * 100, 2) if close_10d else None

        # Max drawdown within 10-day window
        prices_10d = _get_prices_range(ticker, sig_date, LOOKBACK_10D)
        max_dd = None
        if prices_10d and entry:
            lows = [(p - entry) / entry * 100 for p in prices_10d]
            max_dd = round(min(lows), 2)

        hit_tp = None
        hit_sl = None
        if tp_pct and sl_pct and prices_10d and entry:
            tp_price = entry * (1 + tp_pct / 100)
            sl_price = entry * (1 - sl_pct / 100)
            hit_tp = any(p >= tp_price for p in prices_10d)
            hit_sl = any(p <= sl_price for p in prices_10d)

        payload = {
            "close_5d":        int(close_5d)  if close_5d  else None,
            "close_10d":       int(close_10d) if close_10d else None,
            "return_5d":       ret_5d,
            "return_10d":      ret_10d,
            "max_drawdown_10d": max_dd,
            "hit_take_profit": hit_tp,
            "hit_stop_loss":   hit_sl,
        }
        supabase.table("signal_performance").update(payload).eq("id", row["id"]).execute()
        status = f"5d={ret_5d:+.1f}%" if ret_5d is not None else "no data"
        print(f"  {sig_date} {ticker}: {status}")
        updated += 1

    print(f"=== 완료: {updated}건 업데이트 ===")


if __name__ == "__main__":
    run()
