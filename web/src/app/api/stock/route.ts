import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const period = searchParams.get("period") || "1y";

  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }

  // period → 날짜 계산
  const now = new Date();
  const periodMap: Record<string, number> = {
    "3mo": 90,
    "6mo": 180,
    "1y": 365,
    "2y": 730,
    "3y": 1095,
  };
  const days = periodMap[period] || 365;
  const startDate = new Date(now.getTime() - days * 86400000);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: now,
      interval: "1d",
    });

    const quotes = result.quotes
      .filter((q: any) => q.close != null && q.close > 0)
      .map((q: any) => ({
        date: q.date.toISOString().split("T")[0],
        open: q.open ?? q.close,
        high: q.high ?? q.close,
        low: q.low ?? q.close,
        close: q.close,
        volume: q.volume ?? 0,
      }));

    const meta = result.meta;
    const currentPrice =
      meta.regularMarketPrice ??
      meta.postMarketPrice ??
      (quotes.length > 0 ? quotes[quotes.length - 1].close : 0);

    return NextResponse.json({
      ticker,
      name: meta.shortName || meta.longName || ticker,
      currency: meta.currency,
      currentPrice,
      quotes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
