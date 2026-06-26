import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SIGNALS = ["BUY_OK", "BUY_SMALL", "WATCH", "BLOCKED"] as const;

function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100;
}

function winRate(returns: number[]): number | null {
  if (!returns.length) return null;
  return Math.round((returns.filter((r) => r > 0).length / returns.length) * 100);
}

export async function GET() {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceStr = since.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("signal_performance")
    .select("execution_signal, return_1d, return_3d, return_5d, return_10d, hit_stop_loss, hit_take_profit, composite_score")
    .gte("signal_date", sinceStr)
    .not("execution_signal", "is", null);

  if (error) {
    console.error("[api/signal-performance] error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  const rows = data ?? [];

  const stats = SIGNALS.map((sig) => {
    const group = rows.filter((r) => r.execution_signal === sig);
    const r1 = group.map((r) => r.return_1d).filter((v) => v != null) as number[];
    const r3 = group.map((r) => r.return_3d).filter((v) => v != null) as number[];
    const r5 = group.map((r) => r.return_5d).filter((v) => v != null) as number[];
    const r10 = group.map((r) => r.return_10d).filter((v) => v != null) as number[];
    const stopLossRate = group.length
      ? Math.round((group.filter((r) => r.hit_stop_loss).length / group.length) * 100)
      : null;
    const takeProfitRate = group.length
      ? Math.round((group.filter((r) => r.hit_take_profit).length / group.length) * 100)
      : null;

    return {
      signal: sig,
      count: group.length,
      avg_return_1d: avg(r1),
      avg_return_3d: avg(r3),
      avg_return_5d: avg(r5),
      avg_return_10d: avg(r10),
      win_rate_3d: winRate(r3),
      win_rate_5d: winRate(r5),
      stop_loss_rate: stopLossRate,
      take_profit_rate: takeProfitRate,
    };
  });

  return NextResponse.json({ stats, since: sinceStr, total: rows.length });
}
