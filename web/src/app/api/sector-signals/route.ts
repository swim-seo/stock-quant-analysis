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

export type RotationPhase = "침체" | "진입기" | "상승기" | "과열" | "하락기";

export interface SectorFearGreed {
  sector: Sector;
  total: number;             // 0–100 현재 점수
  label: "극도의 공포" | "공포" | "중립" | "탐욕" | "극도의 탐욕";
  signal: "매수관심" | "관찰" | "중립";
  // 4주 추이: [T-20, T-15, T-10, T-5, T-0] — 각 0-100
  weeklyTrend: number[];
  rotationPhase: RotationPhase;
  rotationNote: string;      // "2주 연속 상승 → 진입 초기" 같은 자연어 설명
  components: {
    rsi: ComponentScore;
    maBreadth: ComponentScore;
    momentum: ComponentScore;
    volume: ComponentScore;
    youtube: ComponentScore;
  };
  topStocks: { name: string; ticker: string; changePct: number; rsi: number }[];
  investorFlow: { foreign5d: number; institution5d: number };
}

// ── Price data ────────────────────────────────────────────────────────────────

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
    if (quotes.length < 25) return null;
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

// ── Technical helpers (offset = 0 means today, 5 = 5 trading days ago) ────────

function calcRsiAt(closes: number[], offset: number, period = 14): number {
  const end = closes.length - offset;
  if (end < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = end - period; i < end; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  return Math.round((100 - 100 / (1 + gains / losses)) * 10) / 10;
}

function calcMaAt(closes: number[], offset: number, period: number): number {
  const end = closes.length - offset;
  const slice = closes.slice(Math.max(0, end - period), end);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function calcReturnAt(closes: number[], offset: number, days: number): number {
  const end = closes.length - offset;
  if (end < days + 1) return 0;
  return Math.round(((closes[end - 1] - closes[end - 1 - days]) / closes[end - 1 - days]) * 10000) / 100;
}

function calcVolRatioAt(volumes: number[], offset: number): number {
  const end = volumes.length - offset;
  if (end < 2) return 1;
  const today = volumes[end - 1];
  const avg = volumes.slice(Math.max(0, end - 21), end - 1).reduce((s, v) => s + v, 0) / Math.min(20, end - 1);
  return avg > 0 ? Math.round(today / avg * 100) / 100 : 1;
}

// ── Sector score at a given offset ────────────────────────────────────────────

function sectorScoreAt(stocks: StockData[], offset: number, ytScore: number): number {
  if (stocks.length === 0) return 50;

  const rsiVals = stocks.map(s => calcRsiAt(s.closes, offset));
  const avgRsi = rsiVals.reduce((a, b) => a + b, 0) / rsiVals.length;

  let aboveMa = 0;
  for (const s of stocks) {
    const price = s.closes[s.closes.length - 1 - offset];
    const ma20 = calcMaAt(s.closes, offset, 20);
    if (price > ma20) aboveMa++;
  }

  const retVals = stocks.map(s => calcReturnAt(s.closes, offset, 5));
  const avgRet = retVals.reduce((a, b) => a + b, 0) / retVals.length;

  const volRatios = stocks.map(s => calcVolRatioAt(s.volumes, offset));
  const avgVol = volRatios.reduce((a, b) => a + b, 0) / volRatios.length;

  const rsiScore = (avgRsi / 100) * 20;
  const breadthScore = (aboveMa / stocks.length) * 20;
  const momScore = ((Math.max(-5, Math.min(5, avgRet)) + 5) / 10) * 20;
  const volScore = ((Math.max(0.5, Math.min(2.5, avgVol)) - 0.5) / 2) * 20;

  return Math.round(Math.min(100, Math.max(0, rsiScore + breadthScore + momScore + volScore + ytScore)));
}

// ── Rotation phase classifier ─────────────────────────────────────────────────

function classifyRotation(trend: number[]): { phase: RotationPhase; note: string } {
  const [w4, w3, w2, w1, w0] = trend;
  const delta = w0 - w4;          // 4주 전 대비 현재
  const recentDelta = w0 - w2;    // 2주 전 대비 현재

  // 현재 온도
  const hot = w0 >= 58;
  const cold = w0 <= 38;

  if (hot && delta > 15) {
    return { phase: "상승기", note: `4주간 +${delta}점 상승 중 — 추세 유효, 단 과열 주의` };
  }
  if (hot && delta > 5 && recentDelta > 0) {
    return { phase: "상승기", note: `2주 연속 상승세 — 진입 초기~중기` };
  }
  if (hot && w0 >= 68 && recentDelta <= 2) {
    return { phase: "과열", note: `고점권 유지 중 — 신규 진입 위험, 차익실현 검토` };
  }
  if (w0 >= 48 && w4 <= 40 && recentDelta > 5) {
    return { phase: "진입기", note: `침체에서 회복 시작 — 지금이 진입 초기 신호` };
  }
  if (cold && delta < -10) {
    return { phase: "하락기", note: `4주간 -${Math.abs(delta)}점 하락 — 관망 권고` };
  }
  if (cold && recentDelta >= 0) {
    return { phase: "진입기", note: `바닥권에서 반등 신호 포착 — 소량 진입 검토` };
  }
  if (cold) {
    return { phase: "침체", note: `거래 위축 + 관심 낮음 — 아직 대기` };
  }
  if (w0 >= 50 && delta < -8) {
    return { phase: "하락기", note: `고점 대비 ${Math.abs(delta)}점 하락 — 로테이션 이탈 중` };
  }
  return { phase: "상승기", note: `보합권 유지 — 방향성 확인 후 대응` };
}

// ── Per-component scoring ──────────────────────────────────────────────────────

function scoreRsi(avgRsi: number): ComponentScore {
  const score = Math.round((avgRsi / 100) * 20 * 10) / 10;
  const label = avgRsi >= 70 ? "과매수 (탐욕)" : avgRsi >= 55 ? "상승 모멘텀" : avgRsi >= 45 ? "중립" : avgRsi >= 30 ? "하락 압력" : "과매도 (공포)";
  return { score, label, detail: `RSI ${avgRsi.toFixed(1)}` };
}
function scoreMaBreadth(above: number, total: number): ComponentScore {
  const pct = total > 0 ? above / total : 0.5;
  const score = Math.round(pct * 20 * 10) / 10;
  const label = pct >= 0.8 ? "대부분 상승 추세" : pct >= 0.6 ? "상승 우세" : pct >= 0.4 ? "혼조" : pct >= 0.2 ? "하락 우세" : "대부분 하락";
  return { score, label, detail: `${above}/${total}종목 MA20 상회 (${Math.round(pct * 100)}%)` };
}
function scoreMomentum(ret5d: number): ComponentScore {
  const score = Math.round(((Math.max(-5, Math.min(5, ret5d)) + 5) / 10) * 20 * 10) / 10;
  const label = ret5d >= 3 ? "강한 상승" : ret5d >= 1 ? "상승" : ret5d >= -1 ? "보합" : ret5d >= -3 ? "하락" : "강한 하락";
  return { score, label, detail: `5일 수익률 ${ret5d >= 0 ? "+" : ""}${ret5d}%` };
}
function scoreVolume(avgRatio: number): ComponentScore {
  const score = Math.round(((Math.max(0.5, Math.min(2.5, avgRatio)) - 0.5) / 2) * 20 * 10) / 10;
  const label = avgRatio >= 2.0 ? "거래 폭발 🔥" : avgRatio >= 1.5 ? "거래량 급증" : avgRatio >= 1.1 ? "평균 이상" : avgRatio >= 0.8 ? "평균 수준" : "거래 위축";
  return { score, label, detail: `20일 평균 대비 ${avgRatio}x` };
}
function scoreYoutube(positive: number, negative: number, neutral: number): ComponentScore {
  const total = positive + negative + neutral;
  if (total === 0) return { score: 10, label: "데이터 없음", detail: "언급 없음" };
  const sent = (positive - negative) / total;
  const score = Math.round(((sent + 1) / 2) * 20 * 10) / 10;
  const label = sent >= 0.5 ? "매우 긍정" : sent >= 0.2 ? "긍정" : sent >= -0.2 ? "중립" : sent >= -0.5 ? "부정" : "매우 부정";
  return { score, label, detail: `긍정 ${positive} · 중립 ${neutral} · 부정 ${negative} (14일)` };
}

// ── Supabase: YouTube by sector ────────────────────────────────────────────────

async function getYtBySector() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("youtube_insights")
    .select("key_sectors,market_sentiment,processed_at")
    .gte("processed_at", since)
    .not("key_sectors", "is", null);

  const map = new Map<string, { positive: number; neutral: number; negative: number }>();
  for (const row of data ?? []) {
    const sectors: string[] = Array.isArray(row.key_sectors) ? row.key_sectors : [];
    for (const sec of sectors) {
      if (!map.has(sec)) map.set(sec, { positive: 0, neutral: 0, negative: 0 });
      const e = map.get(sec)!;
      if (row.market_sentiment === "긍정") e.positive++;
      else if (row.market_sentiment === "부정") e.negative++;
      else e.neutral++;
    }
  }
  return map;
}

// ── Supabase: investor flow ────────────────────────────────────────────────────

async function getInvestorFlowBySector() {
  const { data } = await supabase
    .from("stock_news")
    .select("stock_code,investor_data")
    .order("collected_at", { ascending: false })
    .limit(60);

  const stockFlow = new Map<string, { foreign5d: number; institution5d: number }>();
  for (const row of data ?? []) {
    if (stockFlow.has(row.stock_code)) continue;
    let inv: Array<{ foreign_net?: number; institution_net?: number }> = [];
    try { inv = typeof row.investor_data === "string" ? JSON.parse(row.investor_data) : (row.investor_data ?? []); } catch { /**/ }
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

function toLabel(n: number): SectorFearGreed["label"] {
  if (n >= 80) return "극도의 탐욕";
  if (n >= 60) return "탐욕";
  if (n >= 40) return "중립";
  if (n >= 20) return "공포";
  return "극도의 공포";
}
function toSignal(n: number): SectorFearGreed["signal"] {
  if (n >= 55) return "매수관심";
  if (n >= 38) return "관찰";
  return "중립";
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const [allData, ytMap, invMap] = await Promise.all([
    Promise.all(STOCKS.filter(s => s.sector !== "지수").map(s => fetchStockData(s.ticker, s.name, s.sector))),
    getYtBySector(),
    getInvestorFlowBySector(),
  ]);

  const valid = allData.filter((d): d is StockData => d !== null);

  const result: SectorFearGreed[] = SECTORS.filter(s => s !== "지수").map(sector => {
    const stocks = valid.filter(s => s.sector === sector);

    // YouTube score (0-20) — shared across all time points as approximation
    const yt = ytMap.get(sector) ?? { positive: 0, neutral: 0, negative: 0 };
    const ytComp = scoreYoutube(yt.positive, yt.negative, yt.neutral);
    const ytScoreVal = ytComp.score;

    // Weekly trend: T-20, T-15, T-10, T-5, T-0
    const weeklyTrend = [20, 15, 10, 5, 0].map(offset =>
      sectorScoreAt(stocks, offset, ytScoreVal)
    );

    // Current (T-0) detailed breakdown
    const rsiVals = stocks.map(s => calcRsiAt(s.closes, 0));
    const avgRsi = rsiVals.length > 0 ? Math.round(rsiVals.reduce((a, b) => a + b, 0) / rsiVals.length * 10) / 10 : 50;
    let aboveMa = 0;
    for (const s of stocks) {
      if (s.closes[s.closes.length - 1] > calcMaAt(s.closes, 0, 20)) aboveMa++;
    }
    const retVals = stocks.map(s => calcReturnAt(s.closes, 0, 5));
    const avgRet = retVals.length > 0 ? Math.round(retVals.reduce((a, b) => a + b, 0) / retVals.length * 100) / 100 : 0;
    const volRatios = stocks.map(s => calcVolRatioAt(s.volumes, 0));
    const avgVol = volRatios.length > 0 ? Math.round(volRatios.reduce((a, b) => a + b, 0) / volRatios.length * 100) / 100 : 1;

    const total = weeklyTrend[4]; // T-0
    const { phase, note } = classifyRotation(weeklyTrend);

    const topStocks = stocks
      .map((s, i) => ({
        name: s.name, ticker: s.ticker,
        tradingValue: s.closes[s.closes.length - 1] * s.volumes[s.volumes.length - 1],
        changePct: Math.round(((s.closes[s.closes.length - 1] - (s.closes[s.closes.length - 2] ?? s.closes[s.closes.length - 1])) / (s.closes[s.closes.length - 2] ?? s.closes[s.closes.length - 1])) * 10000) / 100,
        rsi: rsiVals[i],
      }))
      .sort((a, b) => b.tradingValue - a.tradingValue)
      .slice(0, 5)
      .map(({ name, ticker, changePct, rsi }) => ({ name, ticker, changePct, rsi }));

    return {
      sector,
      total,
      label: toLabel(total),
      signal: toSignal(total),
      weeklyTrend,
      rotationPhase: phase,
      rotationNote: note,
      components: {
        rsi: scoreRsi(avgRsi),
        maBreadth: scoreMaBreadth(aboveMa, stocks.length),
        momentum: scoreMomentum(avgRet),
        volume: scoreVolume(avgVol),
        youtube: ytComp,
      },
      topStocks,
      investorFlow: invMap.get(sector) ?? { foreign5d: 0, institution5d: 0 },
    };
  });

  result.sort((a, b) => b.total - a.total);
  return NextResponse.json(result);
}
