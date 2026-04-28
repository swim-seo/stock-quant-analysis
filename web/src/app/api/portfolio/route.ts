import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { createClient } from "@supabase/supabase-js";
import { STOCKS, StockInfo } from "@/lib/stocks";

export const dynamic = "force-dynamic";

// ── Constants ────────────────────────────────────────────────
const DEFAULT_START_DATE = "2026-04-25";
const START_CAPITAL = 10_000_000;
const COMMISSION = 0.0015;
const SLIPPAGE = 0.001;
const KOSPI_TICKER = "^KS11";

// ── Strategy configs ─────────────────────────────────────────
const STRATEGIES = [
  {
    id: "short" as const,
    label: "단기",
    desc: "3~10일 단기 모멘텀",
    fastMA: 3, midMA: 10, slowMA: 20,
    rsiLow: 38, rsiHigh: 58, rsiSell: 67,
    volMin: 1.5, maxPos: 3,
    warmup: 25,
  },
  {
    id: "medium" as const,
    label: "중기",
    desc: "5~60일 스윙 트레이딩",
    fastMA: 5, midMA: 20, slowMA: 60,
    rsiLow: 30, rsiHigh: 60, rsiSell: 70,
    volMin: 1.2, maxPos: 5,
    warmup: 65,
  },
  {
    id: "long" as const,
    label: "장기",
    desc: "20~120일 추세 추종",
    fastMA: 20, midMA: 60, slowMA: 120,
    rsiLow: 30, rsiHigh: 65, rsiSell: 75,
    volMin: 1.0, maxPos: 8,
    warmup: 125,
  },
] as const;

type Strategy = typeof STRATEGIES[number];

// ── Types ────────────────────────────────────────────────────
interface Quote { date: string; close: number; volume: number }

interface Signal {
  action: "BUY" | "SELL" | "HOLD";
  techReason: string;
  aiReason: string;
}

interface Trade {
  date: string; ticker: string; name: string;
  action: "BUY" | "SELL";
  price: number; shares: number; amount: number;
  techReason: string; aiReason: string;
}

interface Holding {
  ticker: string; name: string; sector: string;
  shares: number; avgPrice: number; currentPrice: number;
  pnl: number; pnlPct: number;
}

interface DailyValue { date: string; value: number; benchmark: number }

interface StrategyResult {
  id: string; label: string; desc: string;
  currentValue: number; totalReturn: number; totalReturnPct: number;
  holdings: Holding[]; dailyValues: DailyValue[]; trades: Trade[];
}

// ── Technical helpers ─────────────────────────────────────────
function sma(closes: number[], p: number): number | null {
  if (closes.length < p) return null;
  return closes.slice(-p).reduce((a, b) => a + b, 0) / p;
}

function rsi(closes: number[], p = 14): number | null {
  if (closes.length < p + 1) return null;
  const s = closes.slice(-(p + 1));
  let g = 0, l = 0;
  for (let i = 1; i < s.length; i++) {
    const d = s[i] - s[i - 1];
    if (d > 0) g += d; else l += Math.abs(d);
  }
  const ag = g / p, al = l / p;
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function volRatio(vols: number[], p = 20): number | null {
  if (vols.length < p + 1) return null;
  const avg = vols.slice(-(p + 1), -1).reduce((a, b) => a + b, 0) / p;
  return avg === 0 ? null : vols[vols.length - 1] / avg;
}

function supportResistance(closes: number[], lb = 30) {
  const w = closes.slice(-lb);
  return { support: Math.min(...w), resistance: Math.max(...w) };
}

function dowTrend(closes: number[], w = 40): "up" | "down" | "sideways" {
  if (closes.length < w) return "sideways";
  const r = closes.slice(-w);
  const h = Math.floor(w / 2);
  const [f, s] = [r.slice(0, h), r.slice(h)];
  const [fMx, fMn] = [Math.max(...f), Math.min(...f)];
  const [sMx, sMn] = [Math.max(...s), Math.min(...s)];
  if (sMx > fMx && sMn > fMn) return "up";
  if (sMx < fMx && sMn < fMn) return "down";
  return "sideways";
}

// ── Sentiment helpers ─────────────────────────────────────────
type SentimentEntry = { date: string; sentiment: string; detail: string };

function latestSentiment(
  map: Map<string, SentimentEntry[]>,
  name: string,
  asOf: string
): SentimentEntry | null {
  const entries = (map.get(name) || []).filter((e) => e.date <= asOf);
  if (!entries.length) return null;
  return entries.sort((a, b) => b.date.localeCompare(a.date))[0];
}

// ── Signal generation ─────────────────────────────────────────
function getSignal(
  closes: number[],
  volumes: number[],
  st: Strategy,
  ytEntry: SentimentEntry | null,
  newsEntry: SentimentEntry | null
): Signal {
  const maF = sma(closes, st.fastMA);
  const maM = sma(closes, st.midMA);
  const maS = sma(closes, st.slowMA);
  const r = rsi(closes);
  const vr = volRatio(volumes);

  if (maF == null || maM == null || maS == null || r == null || vr == null) {
    return { action: "HOLD", techReason: "", aiReason: "" };
  }

  const cur = closes[closes.length - 1];
  const { support, resistance } = supportResistance(closes, 30);
  const trend = dowTrend(closes, 40);
  const nearRes = (resistance - cur) / cur < 0.02;
  const nearSup = (cur - support) / support < 0.03;

  // AI 센티멘트 점수 계산
  let aiScore = 0;
  const aiParts: string[] = [];

  if (ytEntry) {
    if (ytEntry.sentiment === "긍정") { aiScore++; aiParts.push(`📺 ${ytEntry.detail}`); }
    else if (ytEntry.sentiment === "부정") { aiScore--; aiParts.push(`📺 부정적 언급`); }
  }
  if (newsEntry) {
    if (newsEntry.sentiment === "긍정") { aiScore++; aiParts.push(`📰 뉴스 긍정`); }
    else if (newsEntry.sentiment === "부정") { aiScore--; aiParts.push(`📰 뉴스 부정`); }
  }
  const aiReason = aiParts.join(" · ");

  // SELL: 데드크로스 OR 과매수 OR 저항+하락 OR AI 강한 부정
  const deadCross = maF < maM;
  const overbought = r > st.rsiSell;
  const resSell = nearRes && trend === "down";
  if (deadCross || overbought || resSell || aiScore <= -2) {
    const parts: string[] = [];
    if (deadCross) parts.push(`데드크로스(MA${st.fastMA}<MA${st.midMA})`);
    if (overbought) parts.push(`과매수 RSI ${r.toFixed(0)}`);
    if (resSell) parts.push(`저항선(${Math.round(resistance).toLocaleString()})+하락추세`);
    if (aiScore <= -2) parts.push("AI 부정 신호");
    return { action: "SELL", techReason: parts.join(" · "), aiReason };
  }

  // BUY 점수: AI 긍정이면 임계값 낮춤
  const aligned = maF > maM && maM > maS;
  const rsiOk = r >= st.rsiLow && r <= st.rsiHigh;
  const volOk = vr > st.volMin;
  const trendOk = trend !== "down";
  const techScore = (aligned ? 1 : 0) + (rsiOk ? 1 : 0) + (volOk ? 1 : 0) + (trendOk ? 1 : 0);
  const threshold = aiScore > 0 ? 3 : 4; // AI 긍정이면 임계값 3으로 낮춤

  if (techScore >= threshold) {
    const parts: string[] = [];
    if (aligned) parts.push(`정배열(MA${st.fastMA}>MA${st.midMA})`);
    parts.push(`RSI ${r.toFixed(0)}`);
    if (volOk) parts.push(`거래량 ${vr.toFixed(1)}x`);
    if (nearSup) parts.push(`지지선(${Math.round(support).toLocaleString()})`);
    if (trend === "up") parts.push("상승추세");
    return { action: "BUY", techReason: parts.join(" · "), aiReason };
  }

  return { action: "HOLD", techReason: "", aiReason };
}

// ── Data fetching ─────────────────────────────────────────────
let START_DATE = DEFAULT_START_DATE;

async function fetchQuotes(ticker: string): Promise<Quote[]> {
  const yf = new YahooFinance();
  const warmup = new Date(START_DATE);
  warmup.setDate(warmup.getDate() - 150);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await yf.chart(ticker, { period1: warmup, period2: new Date(), interval: "1d" });
    return res.quotes
      .filter((q: any) => q.close != null && q.volume != null)
      .map((q: any) => ({ date: q.date.toISOString().split("T")[0], close: q.close, volume: q.volume }));
  } catch { return []; }
}

async function fetchSentimentMaps(): Promise<{
  ytMap: Map<string, SentimentEntry[]>;
  newsMap: Map<string, SentimentEntry[]>;
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [ytRes, newsRes] = await Promise.all([
    supabase
      .from("youtube_insights")
      .select("upload_date,processed_at,key_stocks,market_sentiment,summary,channel")
      .neq("summary", "파싱 실패")
      .order("upload_date", { ascending: true }),
    supabase
      .from("stock_news")
      .select("stock_name,collected_at,sentiment")
      .order("collected_at", { ascending: true }),
  ]);

  // YouTube map: stockName → [{date, sentiment, detail}]
  const ytMap = new Map<string, SentimentEntry[]>();
  for (const row of ytRes.data || []) {
    const rawDate = (row.upload_date as string) || (row.processed_at as string);
    const date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate.split("T")[0];
    const channel = row.channel || "";
    const summary = (row.summary as string || "").slice(0, 40);
    const detail = `${channel}: ${summary}`;
    for (const stockName of (row.key_stocks as string[] || [])) {
      if (!ytMap.has(stockName)) ytMap.set(stockName, []);
      ytMap.get(stockName)!.push({ date, sentiment: row.market_sentiment, detail });
    }
  }

  // News map: stockName → [{date, sentiment, detail}]
  const newsMap = new Map<string, SentimentEntry[]>();
  for (const row of newsRes.data || []) {
    const name = row.stock_name as string;
    const date = (row.collected_at as string).split("T")[0];
    if (!newsMap.has(name)) newsMap.set(name, []);
    newsMap.get(name)!.push({ date, sentiment: row.sentiment, detail: "뉴스 분석" });
  }

  return { ytMap, newsMap };
}

// ── Single strategy simulation ────────────────────────────────
async function runStrategy(
  st: Strategy,
  stocksData: { stock: StockInfo; quotes: Quote[] }[],
  quoteMap: Map<string, Quote[]>,
  tradingDates: string[],
  benchmarkMap: Map<string, number>,
  benchmarkStart: number,
  ytMap: Map<string, SentimentEntry[]>,
  newsMap: Map<string, SentimentEntry[]>
): Promise<StrategyResult> {
  let cash = START_CAPITAL;
  const positions = new Map<string, { shares: number; avgPrice: number; stock: StockInfo }>();
  const trades: Trade[] = [];
  const dailyValues: DailyValue[] = [];

  for (const date of tradingDates) {
    const currentPrices = new Map<string, number>();
    for (const [ticker] of positions) {
      const q = quoteMap.get(ticker)?.find((q) => q.date === date);
      if (q) currentPrices.set(ticker, q.close);
    }

    const buySignals: { stock: StockInfo; signal: Signal }[] = [];
    const sellSignals: { ticker: string; signal: Signal }[] = [];

    for (const { stock } of stocksData) {
      const quotes = quoteMap.get(stock.ticker);
      if (!quotes) continue;
      const idx = quotes.findIndex((q) => q.date > date);
      const history = idx === -1 ? quotes : quotes.slice(0, idx);
      if (history.length < st.warmup) continue;

      const closes = history.map((q) => q.close);
      const volumes = history.map((q) => q.volume);
      const ytEntry = latestSentiment(ytMap, stock.name, date);
      const newsEntry = latestSentiment(newsMap, stock.name, date);
      const signal = getSignal(closes, volumes, st, ytEntry, newsEntry);

      if (signal.action === "SELL" && positions.has(stock.ticker)) {
        sellSignals.push({ ticker: stock.ticker, signal });
      } else if (signal.action === "BUY" && !positions.has(stock.ticker)) {
        buySignals.push({ stock, signal });
      }
    }

    // Execute SELLs
    for (const { ticker, signal } of sellSignals) {
      const pos = positions.get(ticker)!;
      const price = currentPrices.get(ticker);
      if (!price) continue;
      const ep = price * (1 - SLIPPAGE);
      const proceeds = pos.shares * ep;
      const comm = proceeds * COMMISSION;
      cash += proceeds - comm;
      trades.push({ date, ticker, name: pos.stock.name, action: "SELL", price: ep, shares: pos.shares, amount: proceeds - comm, techReason: signal.techReason, aiReason: signal.aiReason });
      positions.delete(ticker);
    }

    // Execute BUYs
    if (buySignals.length > 0) {
      const slots = st.maxPos - positions.size;
      if (slots > 0) {
        // AI 긍정 신호 있는 종목 우선 정렬
        const sorted = [...buySignals].sort((a, b) => {
          const aHasAI = a.signal.aiReason.length > 0 ? 1 : 0;
          const bHasAI = b.signal.aiReason.length > 0 ? 1 : 0;
          return bHasAI - aHasAI;
        });
        const toBuy = sorted.slice(0, slots);
        const perStock = cash / toBuy.length;

        for (const { stock, signal } of toBuy) {
          const q = quoteMap.get(stock.ticker)?.find((q) => q.date === date);
          if (!q) continue;
          const ep = q.close * (1 + SLIPPAGE);
          const maxShares = Math.floor((perStock * (1 - COMMISSION)) / ep);
          if (maxShares <= 0) continue;
          const cost = maxShares * ep;
          const comm = cost * COMMISSION;
          cash -= cost + comm;
          positions.set(stock.ticker, { shares: maxShares, avgPrice: ep, stock });
          trades.push({ date, ticker: stock.ticker, name: stock.name, action: "BUY", price: ep, shares: maxShares, amount: cost + comm, techReason: signal.techReason, aiReason: signal.aiReason });
        }
      }
    }

    // Portfolio value
    let pv = cash;
    for (const [ticker, pos] of positions) {
      const q = quoteMap.get(ticker)?.find((q) => q.date === date);
      pv += pos.shares * (q ? q.close : pos.avgPrice);
    }
    const bClose = benchmarkMap.get(date);
    const bNorm = bClose ? (bClose / benchmarkStart) * START_CAPITAL
      : (dailyValues[dailyValues.length - 1]?.benchmark ?? START_CAPITAL);
    dailyValues.push({ date, value: Math.round(pv), benchmark: Math.round(bNorm) });
  }

  // Holdings
  const holdings: Holding[] = [];
  for (const [ticker, pos] of positions) {
    const last = quoteMap.get(ticker)?.at(-1);
    const cur = last?.close ?? pos.avgPrice;
    holdings.push({
      ticker, name: pos.stock.name, sector: pos.stock.sector,
      shares: pos.shares, avgPrice: Math.round(pos.avgPrice),
      currentPrice: Math.round(cur),
      pnl: Math.round((cur - pos.avgPrice) * pos.shares),
      pnlPct: Math.round(((cur - pos.avgPrice) / pos.avgPrice) * 10000) / 100,
    });
  }

  const last = dailyValues.at(-1);
  const finalValue = last?.value ?? START_CAPITAL;
  return {
    id: st.id, label: st.label, desc: st.desc,
    currentValue: finalValue,
    totalReturn: Math.round(finalValue - START_CAPITAL),
    totalReturnPct: Math.round(((finalValue - START_CAPITAL) / START_CAPITAL) * 10000) / 100,
    holdings,
    dailyValues,
    trades: trades.slice(-60),
  };
}

// ── Main simulation ───────────────────────────────────────────
async function runSimulation() {
  const tradable = STOCKS.filter((s) => s.sector !== "지수");

  const [stocksData, benchmarkQuotes, sentimentMaps] = await Promise.all([
    Promise.all(tradable.map((s) => fetchQuotes(s.ticker).then((q) => ({ stock: s, quotes: q })))),
    fetchQuotes(KOSPI_TICKER),
    fetchSentimentMaps(),
  ]);

  const quoteMap = new Map<string, Quote[]>();
  for (const { stock, quotes } of stocksData) {
    if (quotes.length) quoteMap.set(stock.ticker, quotes);
  }

  const allDates = new Set<string>();
  for (const qs of quoteMap.values())
    for (const q of qs) if (q.date >= START_DATE) allDates.add(q.date);
  const tradingDates = Array.from(allDates).sort();

  const benchmarkMap = new Map<string, number>();
  for (const q of benchmarkQuotes) benchmarkMap.set(q.date, q.close);

  // benchmarkStart: tradingDates 첫 날과 가장 가까운 KOSPI 날짜의 종가 사용
  let benchmarkStart = 0;
  const sortedBenchDates = Array.from(benchmarkMap.keys()).sort();
  const firstTradingDate = tradingDates[0];
  for (const d of sortedBenchDates) {
    if (d >= firstTradingDate) { benchmarkStart = benchmarkMap.get(d)!; break; }
  }
  if (!benchmarkStart && sortedBenchDates.length)
    benchmarkStart = benchmarkMap.get(sortedBenchDates.at(-1)!)!;

  if (!tradingDates.length || !benchmarkStart) {
    return { startDate: START_DATE, startCapital: START_CAPITAL, benchmark: { returnPct: 0 }, strategies: [] };
  }

  const strategies = await Promise.all(
    STRATEGIES.map((st) => runStrategy(st, stocksData, quoteMap, tradingDates, benchmarkMap, benchmarkStart, sentimentMaps.ytMap, sentimentMaps.newsMap))
  );

  // Benchmark return: 마지막 거래일 이전 가장 가까운 KOSPI 종가
  const lastDate = tradingDates.at(-1)!;
  let bLast = benchmarkStart;
  for (const d of sortedBenchDates) {
    if (d <= lastDate) bLast = benchmarkMap.get(d)!;
    else break;
  }
  const benchmarkReturnPct = Math.round(((bLast - benchmarkStart) / benchmarkStart) * 10000) / 100;

  return { startDate: START_DATE, startCapital: START_CAPITAL, benchmark: { returnPct: benchmarkReturnPct }, strategies };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const reqDate = url.searchParams.get("startDate");
    START_DATE = (reqDate && /^\d{4}-\d{2}-\d{2}$/.test(reqDate)) ? reqDate : DEFAULT_START_DATE;
    return NextResponse.json(await runSimulation());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
