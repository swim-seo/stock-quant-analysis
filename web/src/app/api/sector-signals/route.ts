import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import YahooFinance from "yahoo-finance2";
import { STOCKS, SECTORS, type Sector } from "@/lib/stocks";

export const revalidate = 600;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface SectorSignal {
  sector: Sector;
  signal: "매수관심" | "관찰" | "중립";
  score: number; // 0–100
  ytScore: number; // YouTube sentiment trend (0–40)
  volumeScore: number; // Volume surge (0–30)
  investorScore: number; // 외국인/기관 net buy (0–30)
  ytDetail: { thisWeek: number; lastWeek: number; positive: number; negative: number };
  volumeDetail: { avgRatio: number; surgingStocks: string[] };
  investorDetail: { foreign5d: number; institution5d: number; topStocks: string[] };
  topStocks: string[];
  reason: string;
}

// ── YouTube sentiment by sector (last 14 days) ──────────────────────────────
async function getYtSectorScores(): Promise<Map<string, { thisWeek: number; lastWeek: number; positive: number; negative: number }>> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("youtube_insights")
    .select("key_sectors,market_sentiment,processed_at")
    .gte("processed_at", since)
    .not("key_sectors", "is", null);

  const map = new Map<string, { thisWeek: number; lastWeek: number; positive: number; negative: number }>();
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  for (const row of data ?? []) {
    const sectors: string[] = Array.isArray(row.key_sectors) ? row.key_sectors : [];
    const ts = new Date(row.processed_at).getTime();
    const isThisWeek = ts >= oneWeekAgo;

    for (const sec of sectors) {
      if (!map.has(sec)) map.set(sec, { thisWeek: 0, lastWeek: 0, positive: 0, negative: 0 });
      const entry = map.get(sec)!;
      if (isThisWeek) entry.thisWeek++;
      else entry.lastWeek++;
      if (row.market_sentiment === "긍정") entry.positive++;
      if (row.market_sentiment === "부정") entry.negative++;
    }
  }
  return map;
}

// ── Volume ratio by sector (yfinance) ───────────────────────────────────────
async function getVolumeBySector(): Promise<Map<string, { avgRatio: number; surgingStocks: string[] }>> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const results = await Promise.all(
    STOCKS.filter(s => s.sector !== "지수").map(async (s) => {
      try {
        const yf = new YahooFinance();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await yf.chart(s.ticker, { period1: since, period2: new Date(), interval: "1d" });
        const quotes = result.quotes.filter((q: any) => q.close != null && q.volume != null);
        if (quotes.length < 5) return null;
        const today = quotes[quotes.length - 1];
        const avgVol = quotes.slice(-21, -1).reduce((sum: number, q: any) => sum + (q.volume ?? 0), 0) / Math.min(20, quotes.length - 1);
        const ratio = avgVol > 0 ? Math.round(today.volume / avgVol * 100) / 100 : 1;
        return { ...s, volumeRatio: ratio };
      } catch {
        return null;
      }
    })
  );

  const map = new Map<string, { avgRatio: number; surgingStocks: string[] }>();
  for (const SECTOR of SECTORS) {
    const sectorStocks = results.filter(r => r?.sector === SECTOR);
    if (sectorStocks.length === 0) continue;
    const ratios = sectorStocks.map(r => r!.volumeRatio);
    const avg = Math.round(ratios.reduce((s, r) => s + r, 0) / ratios.length * 100) / 100;
    const surging = sectorStocks.filter(r => r!.volumeRatio >= 1.5).map(r => r!.name);
    map.set(SECTOR, { avgRatio: avg, surgingStocks: surging });
  }
  return map;
}

// ── Investor flow from stock_news ────────────────────────────────────────────
async function getInvestorBySector(): Promise<Map<string, { foreign5d: number; institution5d: number; topStocks: string[] }>> {
  const { data } = await supabase
    .from("stock_news")
    .select("stock_name,stock_code,investor_data")
    .order("collected_at", { ascending: false })
    .limit(50);

  const stockFlowMap = new Map<string, { foreign5d: number; institution5d: number }>();
  for (const row of data ?? []) {
    let inv: Array<{ foreign_net?: number; institution_net?: number }> = [];
    try {
      inv = typeof row.investor_data === "string" ? JSON.parse(row.investor_data) : (row.investor_data ?? []);
    } catch { /* ignore */ }
    if (!inv.length) continue;
    const foreign5d = inv.slice(0, 5).reduce((s, d) => s + (d.foreign_net ?? 0), 0);
    const institution5d = inv.slice(0, 5).reduce((s, d) => s + (d.institution_net ?? 0), 0);
    if (!stockFlowMap.has(row.stock_code)) {
      stockFlowMap.set(row.stock_code, { foreign5d, institution5d });
    }
  }

  // Map stock code → sector
  const map = new Map<string, { foreign5d: number; institution5d: number; topStocks: string[] }>();
  for (const s of STOCKS) {
    const code = s.ticker.replace(/\.(KS|KQ)$/, "");
    const flow = stockFlowMap.get(code);
    if (!flow) continue;
    const key = s.sector;
    if (!map.has(key)) map.set(key, { foreign5d: 0, institution5d: 0, topStocks: [] });
    const entry = map.get(key)!;
    entry.foreign5d += flow.foreign5d;
    entry.institution5d += flow.institution5d;
    if (flow.foreign5d + flow.institution5d > 0) entry.topStocks.push(s.name);
  }
  return map;
}

// ── Score computation ────────────────────────────────────────────────────────
function computeSignal(
  sector: Sector,
  yt: { thisWeek: number; lastWeek: number; positive: number; negative: number } | undefined,
  vol: { avgRatio: number; surgingStocks: string[] } | undefined,
  inv: { foreign5d: number; institution5d: number; topStocks: string[] } | undefined,
  volumeStocks: string[]
): SectorSignal {
  // YouTube score (0–40): mention momentum + positivity
  let ytScore = 0;
  const ytD = yt ?? { thisWeek: 0, lastWeek: 0, positive: 0, negative: 0 };
  if (ytD.thisWeek > 0) {
    const momentum = ytD.lastWeek > 0 ? ytD.thisWeek / ytD.lastWeek : ytD.thisWeek > 0 ? 2 : 1;
    ytScore += Math.min(20, momentum * 10);
    const total = ytD.positive + ytD.negative + 1;
    ytScore += Math.round((ytD.positive / total) * 20);
  }
  ytScore = Math.round(ytScore);

  // Volume score (0–30)
  let volumeScore = 0;
  const volD = vol ?? { avgRatio: 1, surgingStocks: [] };
  if (volD.avgRatio >= 2.0) volumeScore = 30;
  else if (volD.avgRatio >= 1.5) volumeScore = 20;
  else if (volD.avgRatio >= 1.2) volumeScore = 10;
  else if (volD.avgRatio >= 1.0) volumeScore = 5;

  // Investor score (0–30): foreign + institution net buy
  let investorScore = 0;
  const invD = inv ?? { foreign5d: 0, institution5d: 0, topStocks: [] };
  const netTotal = invD.foreign5d + invD.institution5d;
  if (netTotal > 5_000_000) investorScore = 30;
  else if (netTotal > 1_000_000) investorScore = 20;
  else if (netTotal > 0) investorScore = 10;
  else if (netTotal < -1_000_000) investorScore = -10;

  const score = Math.max(0, Math.min(100, ytScore + volumeScore + investorScore));

  let signal: SectorSignal["signal"] = "중립";
  if (score >= 55) signal = "매수관심";
  else if (score >= 35) signal = "관찰";

  // Reason string
  const parts: string[] = [];
  if (ytD.thisWeek > 0) parts.push(`유튜브 ${ytD.thisWeek}건 언급`);
  if (ytD.positive > ytD.negative && ytD.positive > 0) parts.push(`긍정 ${ytD.positive}건`);
  if (volD.avgRatio >= 1.5) parts.push(`거래량 ${volD.avgRatio}x↑`);
  if (netTotal > 0) parts.push(`외국인+기관 순매수`);
  if (netTotal < 0) parts.push(`외국인+기관 순매도`);
  if (parts.length === 0) parts.push("신호 없음");

  return {
    sector,
    signal,
    score,
    ytScore,
    volumeScore,
    investorScore,
    ytDetail: ytD,
    volumeDetail: volD,
    investorDetail: invD,
    topStocks: volumeStocks.slice(0, 4),
    reason: parts.join(" · "),
  };
}

export async function GET() {
  const [ytMap, volMap, invMap] = await Promise.all([
    getYtSectorScores(),
    getVolumeBySector(),
    getInvestorBySector(),
  ]);

  const signals: SectorSignal[] = SECTORS.filter(s => s !== "지수").map(sector => {
    // Stocks in this sector for topStocks display
    const sectorStocks = STOCKS.filter(s => s.sector === sector).map(s => s.name);
    return computeSignal(
      sector,
      ytMap.get(sector),
      volMap.get(sector),
      invMap.get(sector),
      sectorStocks
    );
  });

  signals.sort((a, b) => b.score - a.score);
  return NextResponse.json(signals);
}
