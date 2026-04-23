import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { STOCKS } from "@/lib/stocks";

export const revalidate = 3600;

interface UndervaluedStock {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  pbr: number | null;
  per: number | null;
  roe: number | null;
  dividendYield: number | null;
  debtRatio: number | null;
  score: number;
  reasons: string[];
}

async function fetchFundamentals(ticker: string, name: string, sector: string): Promise<UndervaluedStock | null> {
  try {
    const yf = new YahooFinance();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [summary, chart]: any = await Promise.all([
      yf.quoteSummary(ticker, { modules: ["financialData", "defaultKeyStatistics", "summaryDetail"] }),
      yf.chart(ticker, { period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), period2: new Date(), interval: "1d" }),
    ]);

    const quotes = chart.quotes.filter((q: any) => q.close != null);
    if (quotes.length < 2) return null;
    const today = quotes[quotes.length - 1];
    const prev = quotes[quotes.length - 2];

    const ks = summary.defaultKeyStatistics;
    const fd = summary.financialData;
    const sd = summary.summaryDetail;

    // 한국 주식은 trailingPE 없음 → forwardPE 사용
    const per: number | null = ks?.forwardPE ?? null;
    const roe: number | null = fd?.returnOnEquity != null ? fd.returnOnEquity * 100 : null;
    // PBR 근사: ROE × PER (DuPont 관계)
    const pbr: number | null = (roe != null && per != null && per > 0)
      ? Math.round(roe / 100 * per * 100) / 100
      : null;
    const dividendYield: number | null = sd?.dividendYield != null ? sd.dividendYield * 100 : null;
    const debtRatio: number | null = fd?.debtToEquity ?? null;
    const freeCashflow: number | null = fd?.freeCashflow ?? null;
    const profitMargin: number | null = ks?.profitMargins != null ? ks.profitMargins * 100 : null;

    // ROE 없으면 판단 불가
    if (roe === null && per === null) return null;

    let score = 0;
    const reasons: string[] = [];

    // PBR (근사값)
    if (pbr !== null && pbr > 0) {
      if (pbr < 0.5) { score += 30; reasons.push(`PBR ${pbr.toFixed(2)} (매우 저평가)`); }
      else if (pbr < 1.0) { score += 20; reasons.push(`PBR ${pbr.toFixed(2)} (저평가)`); }
      else if (pbr < 1.5) { score += 10; }
    }

    // ROE
    if (roe !== null) {
      if (roe > 20) { score += 25; reasons.push(`ROE ${roe.toFixed(1)}% (우수)`); }
      else if (roe > 15) { score += 18; reasons.push(`ROE ${roe.toFixed(1)}%`); }
      else if (roe > 10) { score += 10; }
    }

    // PER (forward)
    if (per !== null && per > 0) {
      if (per < 8) { score += 20; reasons.push(`PER ${per.toFixed(1)} (저평가)`); }
      else if (per < 12) { score += 13; reasons.push(`PER ${per.toFixed(1)}`); }
      else if (per < 15) { score += 6; }
    }

    // 배당
    if (dividendYield !== null && dividendYield > 0) {
      if (dividendYield >= 4) { score += 15; reasons.push(`배당 ${dividendYield.toFixed(1)}%`); }
      else if (dividendYield >= 2.5) { score += 8; reasons.push(`배당 ${dividendYield.toFixed(1)}%`); }
    }

    // 부채비율
    if (debtRatio !== null) {
      if (debtRatio < 30) { score += 10; }
      else if (debtRatio < 80) { score += 5; }
      else if (debtRatio > 300) score -= 10;
    }

    // 잉여현금흐름 양수 보너스
    if (freeCashflow !== null && freeCashflow > 0) score += 5;

    if (score < 15) return null;

    return {
      ticker, name, sector,
      price: Math.round(today.close),
      changePct: Math.round((today.close - prev.close) / prev.close * 10000) / 100,
      pbr, per, roe, dividendYield, debtRatio,
      score,
      reasons,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  // ETF 제외, 일반 주식만
  const targets = STOCKS.filter(s =>
    !s.sector.startsWith("ETF") && s.sector !== "지수"
  );

  // 병렬 fetch (10개씩 배치)
  const results: UndervaluedStock[] = [];
  for (let i = 0; i < targets.length; i += 10) {
    const batch = targets.slice(i, i + 10);
    const batchResults = await Promise.all(
      batch.map(s => fetchFundamentals(s.ticker, s.name, s.sector))
    );
    results.push(...batchResults.filter((r): r is UndervaluedStock => r !== null));
  }

  // 스코어 내림차순 정렬
  results.sort((a, b) => b.score - a.score);

  return NextResponse.json({ stocks: results.slice(0, 10) });
}
