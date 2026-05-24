import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 60; // 1 min cache

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const signal = searchParams.get("signal") ?? "";
  const sector = searchParams.get("sector") ?? "";
  const minScore = parseFloat(searchParams.get("min_score") ?? "0");

  let query = supabase
    .from("trade_signals")
    .select("*")
    .order("composite_score", { ascending: false })
    .limit(200);

  if (signal) query = query.eq("signal", signal.toUpperCase());
  if (sector) query = query.eq("sector", sector);
  if (minScore > 0) query = query.gte("composite_score", minScore);

  const { data, error } = await query;
  if (error) {
    console.error("[api/signals] supabase error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  const rows = data ?? [];

  // Derive overall market_regime from the most common value
  const regimeCounts: Record<string, number> = {};
  for (const row of rows) {
    const r = row.market_regime ?? "NEUTRAL";
    regimeCounts[r] = (regimeCounts[r] ?? 0) + 1;
  }
  const market_regime =
    Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "NEUTRAL";

  const calculated_at = rows[0]?.calculated_at ?? null;

  return NextResponse.json({ market_regime, calculated_at, signals: rows });
}
