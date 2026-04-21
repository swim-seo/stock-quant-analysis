import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { STOCKS } from "@/lib/stocks";

export const revalidate = 300;

export interface StockHeat {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  volume: number;
  tradingValue: number;
  volumeRatio: number;
}

export interface SectorHeat {
  sector: string;
  totalValue: number;
  avgChangePct: number;
  stocks: StockHeat[];
}

async function fetchOne(ticker: string, name: string, sector: string): Promise<StockHeat | null> {
  try {
    const yf = new YahooFinance();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yf.chart(ticker, { period1: since, period2: new Date(), interval: "1d" });
    const quotes = result.quotes.filter((q: any) => q.close != null && q.volume != null);
    if (quotes.length < 2) return null;

    const today = quotes[quotes.length - 1];
    const prev = quotes[quotes.length - 2];
    const avgVol = quotes.slice(-21, -1).reduce((s: number, q: any) => s + (q.volume ?? 0), 0) / 20;

    return {
      ticker,
      name,
      sector,
      price: Math.round(today.close),
      changePct: Math.round((today.close - prev.close) / prev.close * 10000) / 100,
      volume: today.volume,
      tradingValue: Math.round(today.close * today.volume),
      volumeRatio: avgVol > 0 ? Math.round(today.volume / avgVol * 100) / 100 : 1,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const results = await Promise.all(
    STOCKS.filter(s => s.sector !== "지수").map(s => fetchOne(s.ticker, s.name, s.sector))
  );

  const stocks = results.filter((s): s is StockHeat => s !== null);
  stocks.sort((a, b) => b.tradingValue - a.tradingValue);

  // 섹터별 집계
  const map = new Map<string, StockHeat[]>();
  for (const s of stocks) {
    if (!map.has(s.sector)) map.set(s.sector, []);
    map.get(s.sector)!.push(s);
  }

  const sectors: SectorHeat[] = Array.from(map.entries()).map(([sector, ss]) => ({
    sector,
    totalValue: ss.reduce((sum, s) => sum + s.tradingValue, 0),
    avgChangePct: Math.round(ss.reduce((sum, s) => sum + s.changePct, 0) / ss.length * 100) / 100,
    stocks: ss,
  }));
  sectors.sort((a, b) => b.totalValue - a.totalValue);

  return NextResponse.json({ stocks: stocks.slice(0, 15), sectors });
}
