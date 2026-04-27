import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from("portfolio_signals")
    .select("*")
    .eq("status", "holding")
    .order("signal_date", { ascending: false })
    .order("return_pct", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 날짜별 그룹핑 + 요약 통계
  const byDate: Record<string, typeof data> = {};
  for (const row of data ?? []) {
    const d = row.signal_date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(row);
  }

  const groups = Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rows]) => {
      const avgReturn = rows.reduce((s, r) => s + (r.return_pct ?? 0), 0) / rows.length;
      const winners = rows.filter((r) => (r.return_pct ?? 0) > 0).length;
      return { date, rows, avgReturn: Math.round(avgReturn * 100) / 100, winners, total: rows.length };
    });

  return NextResponse.json({ groups });
}
