import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 스나이퍼 기간 판단: 25일~다음달 10일
function getSniperPeriod(): { label: string; active: boolean; daysLeft: number } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const active = day >= 25 || day <= 10;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;

  let label: string;
  let daysLeft: number;
  if (day >= 25) {
    label = `${year}-${String(month).padStart(2,"0")} 스나이퍼 (${month}월25일~${nextMonth}월10일)`;
    const end = new Date(nextYear, nextMonth - 1, 10);
    daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);
  } else {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    label = `${year}-${String(month).padStart(2,"0")} 스나이퍼 (${prevMonth}월25일~${month}월10일)`;
    const end = new Date(year, month - 1, 10);
    daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);
  }

  return { label, active, daysLeft };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") ?? "positions";
  const { label: period, active, daysLeft } = getSniperPeriod();

  // 현재 기간 PnL 요약
  const { data: allPos } = await supabase
    .from("sniper_positions")
    .select("status, pnl_pct, entry_price, shares, pnl_amount")
    .eq("period", period);

  const closed   = (allPos || []).filter(r => r.status === "closed");
  const openPos  = (allPos || []).filter(r => r.status === "open");
  const realized = closed.reduce((s, r) => s + (r.pnl_amount ?? 0), 0);
  const wins     = closed.filter(r => (r.pnl_pct ?? 0) > 0).length;

  const summary = {
    period, active, daysLeft,
    realized_pnl:   Math.round(realized),
    trades:         closed.length,
    win_rate:       closed.length ? Math.round(wins / closed.length * 100) : null,
    open_count:     openPos.length,
  };

  if (tab === "positions") {
    const { data } = await supabase
      .from("sniper_positions")
      .select("*")
      .eq("period", period)
      .eq("status", "open")
      .order("entry_date", { ascending: false });
    return NextResponse.json({ summary, positions: data ?? [] });
  }

  if (tab === "signals") {
    // 최근 trade_signals에서 오늘 스캔 결과
    const { data: signals } = await supabase
      .from("trade_signals")
      .select("ticker, stock_name, sector, signal, execution_signal, market_risk_level, market_risk_score, composite_score, tech_score, yt_score, news_score, factor_score, market_regime, suggested_position_pct, take_profit_pct, stop_loss_pct, max_holding_days, data_freshness_score, stale_components, calculated_at")
      .eq("signal", "BUY")
      .order("composite_score", { ascending: false })
      .limit(30);

    // 오늘 뉴스 감성 호재 종목
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
      .toISOString().split("T")[0];
    const { data: newsToday } = await supabase
      .from("stock_news")
      .select("stock_name, sentiment, trading_signal, news_impact_score")
      .eq("sentiment", "호재")
      .gte("collected_at", `${today}T00:00:00`)
      .order("news_impact_score", { ascending: false })
      .limit(30);

    const hotsMap = new Map((newsToday || []).map(n => [n.stock_name, n]));

    // 기준가 + 시작가 대비 수익률
    const tickers = (signals || []).map(s => s.ticker as string).filter(Boolean);
    const { data: priceRows } = await supabase
      .from("stock_prices")
      .select("ticker,trade_date,open,close")
      .in("ticker", tickers)
      .order("trade_date", { ascending: false })
      .limit(tickers.length * 3);

    type PriceInfo = { entry_price: number; open_price: number; open_change_pct: number | null; trade_date: string };
    const priceMap: Record<string, PriceInfo> = {};
    for (const pr of priceRows ?? []) {
      const t = pr.ticker as string;
      if (priceMap[t]) continue;
      const open = pr.open as number | null;
      const close = pr.close as number | null;
      priceMap[t] = {
        entry_price: close ?? 0,
        open_price: open ?? 0,
        open_change_pct: open && close ? ((close - open) / open) * 100 : null,
        trade_date: pr.trade_date as string,
      };
    }

    const enriched = (signals || []).map(s => ({
      ...s,
      news_today: hotsMap.get(s.stock_name) ?? null,
      has_catalyst: hotsMap.has(s.stock_name),
      ...(priceMap[s.ticker as string] ?? { entry_price: null, open_price: null, open_change_pct: null, trade_date: null }),
    }));

    return NextResponse.json({ summary, signals: enriched });
  }

  if (tab === "history") {
    const { data } = await supabase
      .from("sniper_positions")
      .select("*")
      .eq("period", period)
      .eq("status", "closed")
      .order("exit_date", { ascending: false });
    return NextResponse.json({ summary, history: data ?? [] });
  }

  if (tab === "daily") {
    const BUDGET = 2_000_000;

    // ① 전체 포지션 (모든 status 포함)
    const { data: allTrades } = await supabase
      .from("sniper_positions")
      .select("entry_date, exit_date, pnl_amount, pnl_pct, status, stock_name")
      .eq("period", period)
      .order("entry_date", { ascending: true });

    const trades = allTrades ?? [];
    const statusGroups = {
      holding:     trades.filter(t => t.status === "open").length,
      closed:      trades.filter(t => t.status === "closed").length,
      take_profit: trades.filter(t => t.status === "take_profit").length,
      stop_loss:   trades.filter(t => t.status === "stop_loss").length,
      expired:     trades.filter(t => t.status === "expired").length,
    };
    const exitedTrades = trades.filter(t => t.status !== "open" && t.pnl_pct != null);
    const avgReturn = exitedTrades.length
      ? exitedTrades.reduce((s, t) => s + (t.pnl_pct ?? 0), 0) / exitedTrades.length
      : null;
    const wins = exitedTrades.filter(t => (t.pnl_pct ?? 0) > 0);
    const losses = exitedTrades.filter(t => (t.pnl_pct ?? 0) < 0);
    const winRate = exitedTrades.length ? (wins.length / exitedTrades.length) * 100 : null;
    const avgWin  = wins.length   ? wins.reduce((s, t) => s + (t.pnl_pct ?? 0), 0) / wins.length : null;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + (t.pnl_pct ?? 0), 0) / losses.length) : null;
    const rrRatio = avgWin && avgLoss ? +(avgWin / avgLoss).toFixed(2) : null;

    const positionStats = {
      total: trades.length,
      ...statusGroups,
      avg_return: avgReturn != null ? +avgReturn.toFixed(2) : null,
      win_rate:   winRate   != null ? +winRate.toFixed(1)   : null,
      rr_ratio:   rrRatio,
    };

    // ② 날짜별 누적 PnL (청산 기준)
    const dailyMap: Record<string, number> = {};
    for (const t of trades) {
      if (!t.exit_date || t.pnl_amount == null) continue;
      const d = t.exit_date as string;
      dailyMap[d] = (dailyMap[d] ?? 0) + (t.pnl_amount ?? 0);
    }
    let cumulative = 0;
    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, pnl]) => {
        cumulative += pnl;
        return {
          date,
          daily_pnl:       Math.round(pnl),
          cumulative_pnl:  Math.round(cumulative),
          cumulative_pct:  +((cumulative / BUDGET) * 100).toFixed(2),
        };
      });

    // ③ execution_signal 별 성과 (signal_performance 테이블)
    const { data: perfRows } = await supabase
      .from("signal_performance")
      .select("execution_signal, return_5d, return_10d, hit_take_profit, hit_stop_loss")
      .not("return_5d", "is", null);

    type PerfRow = { execution_signal: string | null; return_5d: number | null; return_10d: number | null; hit_take_profit: boolean | null; hit_stop_loss: boolean | null };
    const perfData = (perfRows ?? []) as PerfRow[];
    const execGroups: Record<string, PerfRow[]> = {};
    for (const r of perfData) {
      const key = r.execution_signal ?? "UNKNOWN";
      execGroups[key] = [...(execGroups[key] ?? []), r];
    }
    const execPerf = Object.entries(execGroups).map(([signal, rows]) => {
      const avg5d  = rows.reduce((s, r) => s + (r.return_5d  ?? 0), 0) / rows.length;
      const avg10d = rows.reduce((s, r) => s + (r.return_10d ?? 0), 0) / rows.length;
      const w5 = rows.filter(r => (r.return_5d ?? 0) > 0).length;
      const tp  = rows.filter(r => r.hit_take_profit).length;
      const sl  = rows.filter(r => r.hit_stop_loss).length;
      return {
        signal,
        count:     rows.length,
        avg_5d:    +avg5d.toFixed(2),
        avg_10d:   +avg10d.toFixed(2),
        win_rate:  +(w5 / rows.length * 100).toFixed(1),
        tp_rate:   +(tp / rows.length * 100).toFixed(1),
        sl_rate:   +(sl / rows.length * 100).toFixed(1),
      };
    }).sort((a, b) => {
      const order = ["BUY_OK", "BUY_SMALL", "WATCH", "BLOCKED", "UNKNOWN"];
      return (order.indexOf(a.signal) ?? 9) - (order.indexOf(b.signal) ?? 9);
    });

    return NextResponse.json({ summary, daily, position_stats: positionStats, exec_perf: execPerf });
  }

  return NextResponse.json({ summary });
}
