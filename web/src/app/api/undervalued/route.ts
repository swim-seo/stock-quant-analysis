import { NextResponse } from "next/server";
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

function parseNum(val: string | undefined | null): number | null {
  if (!val || val === "N/A" || val === "-") return null;
  const n = parseFloat(val.replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

async function fetchNaverData(code: string): Promise<{
  price: number | null;
  changePct: number | null;
  per: number | null;
  pbr: number | null;
  roe: number | null;
  debtRatio: number | null;
  dividendYield: number | null;
} | null> {
  try {
    const headers = { "User-Agent": "Mozilla/5.0" };
    const currentYear = new Date().getFullYear();

    const [basicRes, finRes] = await Promise.all([
      fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, { headers }),
      fetch(`https://m.stock.naver.com/api/stock/${code}/finance/annual`, { headers }),
    ]);
    if (!basicRes.ok || !finRes.ok) return null;

    const [basic, fin] = await Promise.all([basicRes.json(), finRes.json()]);

    const price = parseNum(basic?.closePrice);
    const changePct = parseNum(basic?.fluctuationsRatio);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowList: any[] = fin?.financeInfo?.rowList ?? [];

    function getLatestValue(title: string): number | null {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = rowList.find((r: any) => r.title === title);
      if (!row?.columns) return null;
      const cols = row.columns as Record<string, { value: string }>;
      // 순수 6자리 숫자 키만 (예측값 "E" 접미사 제외), 현재 연도 이하, 내림차순
      const keys = Object.keys(cols)
        .filter((k) => /^\d{6}$/.test(k) && parseInt(k.slice(0, 4)) <= currentYear)
        .sort()
        .reverse();
      for (const key of keys) {
        const val = parseNum(cols[key]?.value);
        if (val !== null) return val;
      }
      return null;
    }

    const per = getLatestValue("PER");
    const pbr = getLatestValue("PBR");
    const roe = getLatestValue("ROE");
    const debtRatio = getLatestValue("부채비율");
    const dividendPerShare = getLatestValue("주당배당금");

    // 배당수익률 = 주당배당금 / 현재가 × 100
    const dividendYield =
      dividendPerShare != null && price && price > 0
        ? Math.round((dividendPerShare / price) * 10000) / 100
        : null;

    return { price, changePct, per, pbr, roe, debtRatio, dividendYield };
  } catch {
    return null;
  }
}

async function fetchFundamentals(
  ticker: string,
  name: string,
  sector: string
): Promise<UndervaluedStock | null> {
  const code = ticker.split(".")[0];
  const data = await fetchNaverData(code);
  if (!data?.price) return null;

  const { price, changePct, per, pbr, roe, debtRatio, dividendYield } = data;

  // 핵심 지표 전부 없으면 스킵
  if (per === null && pbr === null && roe === null) return null;

  let score = 0;
  const reasons: string[] = [];

  // PBR — 네이버 직접 제공이므로 DuPont 근사 불필요
  if (pbr !== null && pbr > 0) {
    if (pbr < 0.5) { score += 30; reasons.push(`PBR ${pbr.toFixed(2)} (매우 저평가)`); }
    else if (pbr < 1.0) { score += 20; reasons.push(`PBR ${pbr.toFixed(2)} (저평가)`); }
    else if (pbr < 1.5) { score += 10; }
  }

  // ROE — 네이버 직접 제공
  if (roe !== null) {
    if (roe > 20) { score += 25; reasons.push(`ROE ${roe.toFixed(1)}% (우수)`); }
    else if (roe > 15) { score += 18; reasons.push(`ROE ${roe.toFixed(1)}%`); }
    else if (roe > 10) { score += 10; }
  }

  // PER
  if (per !== null && per > 0) {
    if (per < 8) { score += 20; reasons.push(`PER ${per.toFixed(1)} (저평가)`); }
    else if (per < 12) { score += 13; reasons.push(`PER ${per.toFixed(1)}`); }
    else if (per < 15) { score += 6; }
  }

  // 배당수익률
  if (dividendYield !== null && dividendYield > 0) {
    if (dividendYield >= 4) { score += 15; reasons.push(`배당 ${dividendYield.toFixed(1)}%`); }
    else if (dividendYield >= 2.5) { score += 8; reasons.push(`배당 ${dividendYield.toFixed(1)}%`); }
  }

  // 부채비율 — 네이버 직접 제공
  if (debtRatio !== null) {
    if (debtRatio < 30) { score += 10; }
    else if (debtRatio < 80) { score += 5; }
    else if (debtRatio > 300) score -= 10;
  }

  if (score < 15) return null;

  return {
    ticker, name, sector,
    price: Math.round(price),
    changePct: changePct ?? 0,
    pbr, per, roe, dividendYield, debtRatio,
    score,
    reasons,
  };
}

export async function GET() {
  const targets = STOCKS.filter(
    (s) => !s.sector.startsWith("ETF") && s.sector !== "지수"
  );

  const results: UndervaluedStock[] = [];
  // 10개씩 배치 병렬 fetch (네이버 과호출 방지)
  for (let i = 0; i < targets.length; i += 10) {
    const batch = targets.slice(i, i + 10);
    const batchResults = await Promise.all(
      batch.map((s) => fetchFundamentals(s.ticker, s.name, s.sector))
    );
    results.push(...batchResults.filter((r): r is UndervaluedStock => r !== null));
  }

  results.sort((a, b) => b.score - a.score);
  return NextResponse.json({ stocks: results.slice(0, 10) });
}
