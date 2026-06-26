import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const since = new Date();
  since.setDate(since.getDate() - 45);
  const sinceStr = since.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("portfolio_signals")
    .select("*")
    .gte("signal_date", sinceStr)
    .order("signal_date", { ascending: false })
    .order("return_pct", { ascending: false })
    .limit(300);

  if (error) {
    console.error("[api/portfolio-live] supabase error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  const today = new Date().toISOString().split("T")[0];

  const byDate: Record<string, typeof data> = {};
  for (const row of data ?? []) {
    const d = row.signal_date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(row);
  }

  const groups = Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rows]) => {
      const closed = rows.filter((r) => r.status !== "holding");
      const holding = rows.filter((r) => r.status === "holding");
      const stoploss = rows.filter((r) => r.status === "sold_stoploss");
      const takeprofit = rows.filter((r) => r.status === "sold_takeprofit");

      // 종료된 것만으로 승률/손익비 계산
      const closedReturns = closed.map((r) => r.return_pct ?? 0);
      const winners = closedReturns.filter((r) => r > 0);
      const losers = closedReturns.filter((r) => r <= 0);
      const avgProfit = winners.length ? winners.reduce((s, v) => s + v, 0) / winners.length : 0;
      const avgLoss = losers.length ? Math.abs(losers.reduce((s, v) => s + v, 0) / losers.length) : 0;
      const profitFactor = avgLoss > 0 ? avgProfit / avgLoss : avgProfit > 0 ? 99 : 0;
      const winRate = closed.length > 0 ? Math.round((winners.length / closed.length) * 100) : null;

      // 전체 평균 수익률 (보유 포함)
      const allReturns = rows.map((r) => r.return_pct ?? 0);
      const avgReturn = allReturns.reduce((s, v) => s + v, 0) / allReturns.length;

      // 보유일수
      const signalDate = new Date(date);
      const todayDate = new Date(today);
      const daysHeld = Math.floor((todayDate.getTime() - signalDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        date,
        rows,
        total: rows.length,
        holdingCount: holding.length,
        stopLossCount: stoploss.length,
        takeProfitCount: takeprofit.length,
        avgReturn: Math.round(avgReturn * 100) / 100,
        winners: winners.length,
        winRate,
        avgProfit: Math.round(avgProfit * 100) / 100,
        avgLoss: Math.round(avgLoss * 100) / 100,
        profitFactor: Math.round(profitFactor * 100) / 100,
        daysHeld,
      };
    });

  return NextResponse.json({ groups });
}
