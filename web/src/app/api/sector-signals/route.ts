import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import YahooFinance from "yahoo-finance2";
import { STOCKS, SECTORS, type Sector } from "@/lib/stocks";

export const revalidate = 600;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComponentScore {
  score: number;   // 0–20
  label: string;
  detail: string;
}

export interface SectorFearGreed {
  sector: Sector;
  total: number;       // 0–100
  label: "극도의 공포" | "공포" | "중립" | "탐욕" | "극도의 탐욕";
  signal: "매수관심" | "관찰" | "중립";
  components: {
    rsi: ComponentScore;          // 평균 RSI (20pt)
    maBreadth: ComponentScore;    // MA20 상회 종목 비율 (20pt)
    momentum: ComponentScore;     // 5일 가격 모멘텀 (20pt)
    volume: ComponentScore;       // 거래량 급증 (20pt)
    youtube: ComponentScore;      // 유튜브 심리 (20pt)
  };
  topStocks: { name: string; ticker: string; changePct: number; rsi: number }[];
  investorFlow: { foreign5d: number; institution5d: number };
}

// ── Price data fetcher ─────────────────────────────────────────────────────────

interface StockData {
  name: string;
  ticker: string;
  sector: string;
  closes: number[];
  volumes: number[];
}

async function fetchStockData(ticker: string, name: string, sector: string): Promise<StockData | null> {
  try {
    const yf = new YahooFinance();
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yf.chart(ticker, { period1: since, period2: new Date(), interval: "1d" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = result.quotes.filter((q: any) => q.close != null && q.volume != null);
    if (quotes.length < 15) return null;
    return {
      name, ticker, sector,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      closes: quotes.map((q: any) => q.close as number),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      volumes: quotes.map((q: any) => q.volume as number),
    };
  } catch {
    return null;
  }
}

// ── Technical indicator helpers ───────────────────────────────────────────────

function calcRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function calcMa(closes: number[], period: number): number {
  const slice = closes.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function calcReturn(closes: number[], days: number): number {
  if (closes.length < days + 1) return 0;
  const now = closes[closes.length - 1];
  const past = closes[closes.length - 1 - days];
  return Math.round(((now - past) / past) * 10000) / 100;
}

// ── Per-sector component scoring ──────────────────────────────────────────────

function scoreRsi(avgRsi: number): ComponentScore {
  // RSI 자체를 0–20으로 선형 매핑. 단, 과매도(< 35) = fear, 과매수(> 65) = greed
  const score = Math.round((avgRsi / 100) * 20 * 10) / 10;
  const label =
    avgRsi >= 70 ? "과매수 (탐욕)" :
    avgRsi >= 55 ? "상승 모멘텀" :
    avgRsi >= 45 ? "중립" :
    avgRsi >= 30 ? "하락 압력" : "과매도 (공포)";
  return { score, label, detail: `RSI ${avgRsi.toFixed(1)}` };
}

function scoreMaBreadth(aboveMa20: number, total: number): ComponentScore {
  const pct = total > 0 ? aboveMa20 / total : 0.5;
  const score = Math.round(pct * 20 * 10) / 10;
  const label =
    pct >= 0.8 ? "대부분 상승 추세" :
    pct >= 0.6 ? "상승 우세" :
    pct >= 0.4 ? "혼조" :
    pct >= 0.2 ? "하락 우세" : "대부분 하락 추세";
  return { score, label, detail: `${aboveMa20}/${total}종목 MA20 상회 (${Math.round(pct * 100)}%)` };
}

function scoreMomentum(ret5d: number): ComponentScore {
  // -5% ~ +5% → 0~20
  const clamped = Math.max(-5, Math.min(5, ret5d));
  const score = Math.round(((clamped + 5) / 10) * 20 * 10) / 10;
  const label =
    ret5d >= 3 ? "강한 상승" :
    ret5d >= 1 ? "상승" :
    ret5d >= -1 ? "보합" :
    ret5d >= -3 ? "하락" : "강한 하락";
  return { score, label, detail: `5일 수익률 ${ret5d >= 0 ? "+" : ""}${ret5d}%` };
}

function scoreVolume(avgRatio: number): ComponentScore {
  // 0.5x ~ 2.5x → 0~20
  const clamped = Math.max(0.5, Math.min(2.5, avgRatio));
  const score = Math.round(((clamped - 0.5) / 2) * 20 * 10) / 10;
  const label =
    avgRatio >= 2.0 ? "거래 폭발 🔥" :
    avgRatio >= 1.5 ? "거래량 급증" :
    avgRatio >= 1.1 ? "평균 이상" :
    avgRatio >= 0.8 ? "평균 수준" : "거래 위축";
  return { score, label, detail: `20일 평균 대비 ${avgRatio}x` };
}

function scoreYoutube(positive: number, negative: number, neutral: number): ComponentScore {
  const total = positive + negative + neutral;
  if (total === 0) return { score: 10, label: "데이터 없음", detail: "언급 없음" };
  const sentScore = (positive - negative) / total; // -1 ~ +1
  const score = Math.round(((sentScore + 1) / 2) * 20 * 10) / 10;
  const label =
    sentScore >= 0.5 ? "매우 긍정적" :
    sentScore >= 0.2 ? "긍정적" :
    sentScore >= -0.2 ? "중립" :
    sentScore >= -0.5 ? "부정적" : "매우 부정적";
  return { score, label, detail: `긍정 ${positive} · 중립 ${neutral} · 부정 ${negative} (14일)` };
}

// ── Supabase: YouTube sentiment by sector ─────────────────────────────────────

async function getYtBySector(): Promise<Map<string, { positive: number; neutral: number; negative: number; thisWeek: number; lastWeek: number }>> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("youtube_insights")
    .select("key_sectors,market_sentiment,processed_at")
    .gte("processed_at", since)
    .not("key_sectors", "is", null);

  const map = new Map<string, { positive: number; neutral: number; negative: number; thisWeek: number; lastWeek: number }>();
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const row of data ?? []) {
    const sectors: string[] = Array.isArray(row.key_sectors) ? row.key_sectors : [];
    const ts = new Date(row.processed_at).getTime();
    const isThisWeek = ts >= oneWeekAgo;

    for (const sec of sectors) {
      if (!map.has(sec)) map.set(sec, { positive: 0, neutral: 0, negative: 0, thisWeek: 0, lastWeek: 0 });
      const e = map.get(sec)!;
      if (row.market_sentiment === "긍정") e.positive++;
      else if (row.market_sentiment === "부정") e.negative++;
      else e.neutral++;
      if (isThisWeek) e.thisWeek++; else e.lastWeek++;
    }
  }
  return map;
}

// ── Supabase: investor flow from stock_news ────────────────────────────────────

async function getInvestorFlowBySector(): Promise<Map<string, { foreign5d: number; institution5d: number }>> {
  const { data } = await supabase
    .from("stock_news")
    .select("stock_code,investor_data")
    .order("collected_at", { ascending: false })
    .limit(60);

  const stockFlow = new Map<string, { foreign5d: number; institution5d: number }>();
  for (const row of data ?? []) {
    if (stockFlow.has(row.stock_code)) continue;
    let inv: Array<{ foreign_net?: number; institution_net?: number }> = [];
    try { inv = typeof row.investor_data === "string" ? JSON.parse(row.investor_data) : (row.investor_data ?? []); } catch { /* */ }
    if (!inv.length) continue;
    stockFlow.set(row.stock_code, {
      foreign5d: inv.slice(0, 5).reduce((s, d) => s + (d.foreign_net ?? 0), 0),
      institution5d: inv.slice(0, 5).reduce((s, d) => s + (d.institution_net ?? 0), 0),
    });
  }

  const sectorMap = new Map<string, { foreign5d: number; institution5d: number }>();
  for (const s of STOCKS) {
    const code = s.ticker.replace(/\.(KS|KQ)$/, "");
    const flow = stockFlow.get(code);
    if (!flow) continue;
    const prev = sectorMap.get(s.sector) ?? { foreign5d: 0, institution5d: 0 };
    sectorMap.set(s.sector, {
      foreign5d: prev.foreign5d + flow.foreign5d,
      institution5d: prev.institution5d + flow.institution5d,
    });
  }
  return sectorMap;
}

// ── Label from total score ─────────────────────────────────────────────────────

function toLabel(total: number): SectorFearGreed["label"] {
  if (total >= 80) return "극도의 탐욕";
  if (total >= 60) return "탐욕";
  if (total >= 40) return "중립";
  if (total >= 20) return "공포";
  return "극도의 공포";
}

function toSignal(total: number): SectorFearGreed["signal"] {
  if (total >= 55) return "매수관심";
  if (total >= 38) return "관찰";
  return "중립";
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  // Fetch all stock price data and YouTube/investor data in parallel
  const [allData, ytMap, invMap] = await Promise.all([
    Promise.all(
      STOCKS.filter(s => s.sector !== "지수").map(s => fetchStockData(s.ticker, s.name, s.sector))
    ),
    getYtBySector(),
    getInvestorFlowBySector(),
  ]);

  const validStocks = allData.filter((d): d is StockData => d !== null);

  const result: SectorFearGreed[] = SECTORS.filter(s => s !== "지수").map(sector => {
    const stocks = validStocks.filter(s => s.sector === sector);

    // ── Technical indicators ──
    const rsiValues = stocks.map(s => calcRsi(s.closes));
    const avgRsi = rsiValues.length > 0
      ? Math.round(rsiValues.reduce((a, b) => a + b, 0) / rsiValues.length * 10) / 10
      : 50;

    let aboveMa20 = 0;
    for (const s of stocks) {
      const ma20 = calcMa(s.closes, 20);
      if (s.closes[s.closes.length - 1] > ma20) aboveMa20++;
    }

    const ret5dValues = stocks.map(s => calcReturn(s.closes, 5));
    const avgRet5d = ret5dValues.length > 0
      ? Math.round(ret5dValues.reduce((a, b) => a + b, 0) / ret5dValues.length * 100) / 100
      : 0;

    const volRatios = stocks.map(s => {
      const today = s.volumes[s.volumes.length - 1];
      const avg = s.volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.min(20, s.volumes.length - 1);
      return avg > 0 ? today / avg : 1;
    });
    const avgVolRatio = volRatios.length > 0
      ? Math.round(volRatios.reduce((a, b) => a + b, 0) / volRatios.length * 100) / 100
      : 1;

    // ── YouTube ──
    const yt = ytMap.get(sector) ?? { positive: 0, neutral: 0, negative: 0, thisWeek: 0, lastWeek: 0 };

    // ── Component scores ──
    const rsiComp = scoreRsi(avgRsi);
    const maBreadthComp = scoreMaBreadth(aboveMa20, stocks.length);
    const momentumComp = scoreMomentum(avgRet5d);
    const volumeComp = scoreVolume(avgVolRatio);
    const youtubeComp = scoreYoutube(yt.positive, yt.negative, yt.neutral);

    const total = Math.round(
      rsiComp.score + maBreadthComp.score + momentumComp.score + volumeComp.score + youtubeComp.score
    );

    // ── Top stocks (by trading value, with RSI) ──
    const topStocks = stocks
      .map((s, i) => {
        const tradingValue = s.closes[s.closes.length - 1] * s.volumes[s.volumes.length - 1];
        const prev = s.closes[s.closes.length - 2] ?? s.closes[s.closes.length - 1];
        const changePct = Math.round(((s.closes[s.closes.length - 1] - prev) / prev) * 10000) / 100;
        return { name: s.name, ticker: s.ticker, changePct, rsi: rsiValues[i], tradingValue };
      })
      .sort((a, b) => b.tradingValue - a.tradingValue)
      .slice(0, 5)
      .map(({ name, ticker, changePct, rsi }) => ({ name, ticker, changePct, rsi }));

    const investorFlow = invMap.get(sector) ?? { foreign5d: 0, institution5d: 0 };

    return {
      sector,
      total: Math.min(100, Math.max(0, total)),
      label: toLabel(total),
      signal: toSignal(total),
      components: {
        rsi: rsiComp,
        maBreadth: maBreadthComp,
        momentum: momentumComp,
        volume: volumeComp,
        youtube: youtubeComp,
      },
      topStocks,
      investorFlow,
    };
  });

  result.sort((a, b) => b.total - a.total);
  return NextResponse.json(result);
}
