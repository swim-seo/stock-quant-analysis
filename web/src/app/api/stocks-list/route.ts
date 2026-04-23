import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SECTORS, STOCKS_BY_SECTOR } from "@/lib/stocks";
import type { Sector } from "@/lib/stocks";

export const revalidate = 3600;

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("stock_master")
    .select("ticker,name,sector,market,market_cap")
    .order("market_cap", { ascending: false });

  // KRX 데이터가 없으면 정적 stocks.ts fallback
  if (error || !data || data.length === 0) {
    const fallback: Record<string, { ticker: string; name: string; sector: string }[]> = {};
    for (const sector of SECTORS) {
      fallback[sector] = (STOCKS_BY_SECTOR[sector as Sector] || []).map((s) => ({
        ticker: s.ticker,
        name: s.name,
        sector: s.sector,
      }));
    }
    return NextResponse.json({ source: "static", bySector: fallback });
  }

  const bySector: Record<string, typeof data> = {};
  for (const stock of data) {
    const sec = stock.sector || "기타";
    if (!bySector[sec]) bySector[sec] = [];
    bySector[sec].push(stock);
  }

  return NextResponse.json({ source: "krx", total: data.length, bySector });
}
