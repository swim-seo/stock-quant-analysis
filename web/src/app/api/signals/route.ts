import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 60; // 1 min cache

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type DayFlow = { foreign_net?: number; institution_net?: number };

function calcStreak(days: DayFlow[], key: keyof DayFlow): number {
  if (!days?.length) return 0;
  const direction = (days[0][key] ?? 0) > 0 ? 1 : -1;
  let streak = 0;
  for (const d of days) {
    const val = d[key] ?? 0;
    if (direction > 0 ? val > 0 : val < 0) streak++;
    else break;
  }
  return streak * direction;
}

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

  // Load investor flow streaks from stock_news
  const codes = rows.map((r: Record<string, unknown>) => r.ticker as string).filter(Boolean)
    .map((t: string) => t.split(".")[0]);
  const { data: newsRows } = await supabase
    .from("stock_news")
    .select("stock_code,investor_data")
    .in("stock_code", codes)
    .order("collected_at", { ascending: false })
    .limit(500);

  const flowMap: Record<string, { foreign_streak: number; inst_streak: number }> = {};
  for (const nr of newsRows ?? []) {
    const code = nr.stock_code as string;
    if (flowMap[code]) continue;
    const inv: DayFlow[] = Array.isArray(nr.investor_data) ? nr.investor_data : [];
    if (inv.length) {
      flowMap[code] = {
        foreign_streak:  calcStreak(inv, "foreign_net"),
        inst_streak:     calcStreak(inv, "institution_net"),
      };
    }
  }

  // Load latest stock prices (open/close) for entry price & open-change display
  const tickers = rows.map((r: Record<string, unknown>) => r.ticker as string).filter(Boolean);
  const { data: priceRows } = await supabase
    .from("stock_prices")
    .select("ticker,trade_date,open,close")
    .in("ticker", tickers)
    .order("trade_date", { ascending: false })
    .limit(tickers.length * 3);

  // Keep only the most recent row per ticker
  const priceMap: Record<string, { entry_price: number; open_price: number; open_change_pct: number | null; trade_date: string }> = {};
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

  const enriched = rows.map((r: Record<string, unknown>) => {
    const ticker = (r.ticker as string) ?? "";
    const code = ticker.split(".")[0];
    return {
      ...r,
      ...(flowMap[code] ?? { foreign_streak: 0, inst_streak: 0 }),
      ...(priceMap[ticker] ?? { entry_price: null, open_price: null, open_change_pct: null, trade_date: null }),
    };
  });

  // Derive overall market_regime from the most common value
  const regimeCounts: Record<string, number> = {};
  for (const row of rows) {
    const regime = (row as Record<string, unknown>).market_regime as string ?? "NEUTRAL";
    regimeCounts[regime] = (regimeCounts[regime] ?? 0) + 1;
  }
  const market_regime =
    Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "NEUTRAL";

  const calculated_at = rows[0]?.calculated_at ?? null;

  return NextResponse.json({ market_regime, calculated_at, signals: enriched });
}
