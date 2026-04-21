import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { STOCKS, StockInfo } from "@/lib/stocks";

// --- Constants ---
const START_DATE = "2026-04-17";
const START_CAPITAL = 10_000_000; // 1000만원
const COMMISSION_RATE = 0.0015; // 0.15%
const SLIPPAGE_RATE = 0.001; // 0.1%
const MAX_POSITIONS = 5;
const KOSPI_TICKER = "^KS11";

// --- Types ---
interface Quote {
  date: string;
  close: number;
  volume: number;
}

interface Holding {
  ticker: string;
  name: string;
  sector: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
}

interface Trade {
  date: string;
  ticker: string;
  name: string;
  action: "BUY" | "SELL";
  price: number;
  shares: number;
  amount: number;
}

interface DailyValue {
  date: string;
  value: number;
  benchmark: number;
}

interface SimulationResult {
  startDate: string;
  startCapital: number;
  currentValue: number;
  totalReturn: number;
  totalReturnPct: number;
  benchmark: { ticker: string; returnPct: number };
  holdings: Holding[];
  dailyValues: DailyValue[];
  trades: Trade[];
}

// --- Technical indicator helpers ---

function calcSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;
  const recent = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcVolumeRatio(volumes: number[], period: number = 20): number | null {
  if (volumes.length < period + 1) return null;
  const avgVol =
    volumes.slice(-(period + 1), -1).reduce((a, b) => a + b, 0) / period;
  if (avgVol === 0) return null;
  return volumes[volumes.length - 1] / avgVol;
}

// --- Data fetching ---

async function fetchQuotes(
  ticker: string,
  startDate: string
): Promise<Quote[]> {
  const yahooFinance = new YahooFinance();
  // Fetch extra history for indicator warm-up (60 trading days buffer)
  const warmupStart = new Date(startDate);
  warmupStart.setDate(warmupStart.getDate() - 120);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(ticker, {
      period1: warmupStart,
      period2: new Date(),
      interval: "1d",
    });

    return result.quotes
      .filter((q: any) => q.close != null && q.volume != null)
      .map((q: any) => ({
        date: q.date.toISOString().split("T")[0],
        close: q.close as number,
        volume: q.volume as number,
      }));
  } catch {
    return [];
  }
}

// --- Signal generation ---

interface Signal {
  action: "BUY" | "SELL" | "HOLD";
}

function getSignal(closes: number[], volumes: number[]): Signal {
  const ma5 = calcSMA(closes, 5);
  const ma20 = calcSMA(closes, 20);
  const ma60 = calcSMA(closes, 60);
  const rsi = calcRSI(closes, 14);
  const volumeRatio = calcVolumeRatio(volumes, 20);

  // Need all indicators available
  if (
    ma5 === null ||
    ma20 === null ||
    ma60 === null ||
    rsi === null ||
    volumeRatio === null
  ) {
    return { action: "HOLD" };
  }

  // SELL signal: dead cross OR overbought
  if (ma5 < ma20 || rsi > 70) {
    return { action: "SELL" };
  }

  // BUY signal: golden cross region AND RSI 30-60 AND volume surge
  if (ma5 > ma20 && rsi >= 30 && rsi <= 60 && volumeRatio > 1.2) {
    return { action: "BUY" };
  }

  return { action: "HOLD" };
}

// --- Simulation engine ---

async function runSimulation(): Promise<SimulationResult> {
  // 1. Fetch all stock data in parallel
  const tradableStocks = STOCKS.filter((s) => s.sector !== "지수");
  const dataPromises = tradableStocks.map((s) =>
    fetchQuotes(s.ticker, START_DATE).then((quotes) => ({
      stock: s,
      quotes,
    }))
  );
  const benchmarkPromise = fetchQuotes(KOSPI_TICKER, START_DATE);

  const [stocksData, benchmarkQuotes] = await Promise.all([
    Promise.all(dataPromises),
    benchmarkPromise,
  ]);

  // Build per-ticker quote maps
  const quoteMap = new Map<string, Quote[]>();
  for (const { stock, quotes } of stocksData) {
    if (quotes.length > 0) {
      quoteMap.set(stock.ticker, quotes);
    }
  }

  // 2. Collect all trading dates from start date onward
  const allDates = new Set<string>();
  for (const quotes of quoteMap.values()) {
    for (const q of quotes) {
      if (q.date >= START_DATE) allDates.add(q.date);
    }
  }
  const tradingDates = Array.from(allDates).sort();

  if (tradingDates.length === 0) {
    return {
      startDate: START_DATE,
      startCapital: START_CAPITAL,
      currentValue: START_CAPITAL,
      totalReturn: 0,
      totalReturnPct: 0,
      benchmark: { ticker: KOSPI_TICKER, returnPct: 0 },
      holdings: [],
      dailyValues: [],
      trades: [],
    };
  }

  // Build benchmark lookup
  const benchmarkMap = new Map<string, number>();
  for (const q of benchmarkQuotes) {
    benchmarkMap.set(q.date, q.close);
  }

  // Find benchmark start value
  let benchmarkStartValue: number | null = null;
  for (const d of tradingDates) {
    const bv = benchmarkMap.get(d);
    if (bv != null) {
      benchmarkStartValue = bv;
      break;
    }
  }

  // 3. Simulate day by day
  let cash = START_CAPITAL;
  const positions = new Map<
    string,
    { shares: number; avgPrice: number; stock: StockInfo }
  >();
  const trades: Trade[] = [];
  const dailyValues: DailyValue[] = [];

  for (const date of tradingDates) {
    // Get current prices for held positions
    const currentPrices = new Map<string, number>();
    for (const [ticker] of positions) {
      const quotes = quoteMap.get(ticker);
      if (!quotes) continue;
      const dayQuote = quotes.find((q) => q.date === date);
      if (dayQuote) currentPrices.set(ticker, dayQuote.close);
    }

    // Generate signals for all stocks
    const buySignals: StockInfo[] = [];
    const sellSignals: string[] = [];

    for (const { stock } of stocksData) {
      const quotes = quoteMap.get(stock.ticker);
      if (!quotes) continue;

      // Get all quotes up to this date
      const historyIdx = quotes.findIndex((q) => q.date > date);
      const history =
        historyIdx === -1 ? quotes : quotes.slice(0, historyIdx);

      if (history.length < 61) continue; // need enough data for MA60 + 1

      const closes = history.map((q) => q.close);
      const volumes = history.map((q) => q.volume);
      const signal = getSignal(closes, volumes);

      if (signal.action === "SELL" && positions.has(stock.ticker)) {
        sellSignals.push(stock.ticker);
      } else if (signal.action === "BUY" && !positions.has(stock.ticker)) {
        buySignals.push(stock);
      }
    }

    // Execute SELL orders first
    for (const ticker of sellSignals) {
      const pos = positions.get(ticker);
      if (!pos) continue;
      const price = currentPrices.get(ticker);
      if (!price) continue;

      const effectivePrice = price * (1 - SLIPPAGE_RATE);
      const proceeds = pos.shares * effectivePrice;
      const commission = proceeds * COMMISSION_RATE;
      cash += proceeds - commission;

      trades.push({
        date,
        ticker,
        name: pos.stock.name,
        action: "SELL",
        price: effectivePrice,
        shares: pos.shares,
        amount: proceeds - commission,
      });

      positions.delete(ticker);
    }

    // Execute BUY orders (equal weight, max positions)
    if (buySignals.length > 0) {
      const availableSlots = MAX_POSITIONS - positions.size;
      if (availableSlots > 0) {
        const toBuy = buySignals.slice(0, availableSlots);
        const perStock = cash / toBuy.length;

        for (const stock of toBuy) {
          const quotes = quoteMap.get(stock.ticker);
          if (!quotes) continue;
          const dayQuote = quotes.find((q) => q.date === date);
          if (!dayQuote) continue;

          const effectivePrice = dayQuote.close * (1 + SLIPPAGE_RATE);
          const maxShares = Math.floor(
            (perStock * (1 - COMMISSION_RATE)) / effectivePrice
          );
          if (maxShares <= 0) continue;

          const cost = maxShares * effectivePrice;
          const commission = cost * COMMISSION_RATE;
          cash -= cost + commission;

          positions.set(stock.ticker, {
            shares: maxShares,
            avgPrice: effectivePrice,
            stock,
          });

          trades.push({
            date,
            ticker: stock.ticker,
            name: stock.name,
            action: "BUY",
            price: effectivePrice,
            shares: maxShares,
            amount: cost + commission,
          });
        }
      }
    }

    // Calculate portfolio value
    let portfolioValue = cash;
    for (const [ticker, pos] of positions) {
      const quotes = quoteMap.get(ticker);
      if (!quotes) continue;
      const dayQuote = quotes.find((q) => q.date === date);
      const price = dayQuote ? dayQuote.close : pos.avgPrice;
      portfolioValue += pos.shares * price;
    }

    // Benchmark value
    const benchmarkClose = benchmarkMap.get(date);
    const benchmarkNormalized =
      benchmarkStartValue && benchmarkClose
        ? (benchmarkClose / benchmarkStartValue) * START_CAPITAL
        : dailyValues.length > 0
          ? dailyValues[dailyValues.length - 1].benchmark
          : START_CAPITAL;

    dailyValues.push({
      date,
      value: Math.round(portfolioValue),
      benchmark: Math.round(benchmarkNormalized),
    });
  }

  // 4. Build final holdings
  const holdings: Holding[] = [];
  for (const [ticker, pos] of positions) {
    const quotes = quoteMap.get(ticker);
    const lastQuote = quotes ? quotes[quotes.length - 1] : null;
    const currentPrice = lastQuote ? lastQuote.close : pos.avgPrice;
    const pnl = (currentPrice - pos.avgPrice) * pos.shares;
    const pnlPct = ((currentPrice - pos.avgPrice) / pos.avgPrice) * 100;

    holdings.push({
      ticker,
      name: pos.stock.name,
      sector: pos.stock.sector,
      shares: pos.shares,
      avgPrice: Math.round(pos.avgPrice),
      currentPrice: Math.round(currentPrice),
      pnl: Math.round(pnl),
      pnlPct: Math.round(pnlPct * 100) / 100,
    });
  }

  // 5. Calculate final values
  const lastDailyValue =
    dailyValues.length > 0
      ? dailyValues[dailyValues.length - 1]
      : { value: START_CAPITAL, benchmark: START_CAPITAL };

  const totalReturn = lastDailyValue.value - START_CAPITAL;
  const totalReturnPct = (totalReturn / START_CAPITAL) * 100;

  const benchmarkReturn =
    ((lastDailyValue.benchmark - START_CAPITAL) / START_CAPITAL) * 100;

  return {
    startDate: START_DATE,
    startCapital: START_CAPITAL,
    currentValue: lastDailyValue.value,
    totalReturn: Math.round(totalReturn),
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    benchmark: {
      ticker: KOSPI_TICKER,
      returnPct: Math.round(benchmarkReturn * 100) / 100,
    },
    holdings,
    dailyValues,
    trades: trades.slice(-50), // last 50 trades
  };
}

// --- API Route ---

export async function GET() {
  try {
    const result = await runSimulation();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
