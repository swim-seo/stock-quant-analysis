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
      .select("ticker, stock_name, sector, signal, composite_score, tech_score, yt_score, news_score, factor_score, market_regime, calculated_at")
      .eq("signal", "BUY")
      .order("composite_score", { ascending: false })
      .limit(20);

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

    const enriched = (signals || []).map(s => ({
      ...s,
      news_today: hotsMap.get(s.stock_name) ?? null,
      has_catalyst: hotsMap.has(s.stock_name),
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
    // 일별 누적 수익률 (포지션 기준)
    const { data: allTrades } = await supabase
      .from("sniper_positions")
      .select("entry_date, exit_date, pnl_amount, pnl_pct, status")
      .eq("period", period)
      .order("entry_date", { ascending: true });

    // 날짜별 실현 PnL 집계
    const dailyMap: Record<string, number> = {};
    for (const t of (allTrades || [])) {
      if (t.status !== "closed" || !t.exit_date) continue;
      const d = t.exit_date as string;
      dailyMap[d] = (dailyMap[d] ?? 0) + (t.pnl_amount ?? 0);
    }

    // 누적 합산
    const BUDGET = 2_000_000;
    let cumulative = 0;
    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, pnl]) => {
        cumulative += pnl;
        return {
          date,
          daily_pnl:    Math.round(pnl),
          cumulative_pnl: Math.round(cumulative),
          cumulative_pct: +((cumulative / BUDGET) * 100).toFixed(2),
        };
      });

    return NextResponse.json({ summary, daily });
  }

  return NextResponse.json({ summary });
}
