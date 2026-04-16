import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { createClient } from "@supabase/supabase-js";

const yahooFinance = new YahooFinance();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ── 1. 코스피 변동성 (20점) ── */
async function scoreVolatility() {
  try {
    const now = new Date();
    const start = new Date(now.getTime() - 90 * 86400000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart("^KS11", {
      period1: start,
      period2: now,
      interval: "1d",
    });
    const closes = result.quotes.map((q: { close: number }) => q.close).filter(Boolean);
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const recent20 = returns.slice(-20);
    const mean = recent20.reduce((a, b) => a + b, 0) / recent20.length;
    const variance = recent20.reduce((s, r) => s + (r - mean) ** 2, 0) / recent20.length;
    const vol20 = Math.sqrt(variance) * Math.sqrt(252) * 100;

    const score = Math.round(Math.max(0, Math.min(20, ((30 - vol20) / 20) * 20)) * 10) / 10;
    const label = score >= 16 ? "매우 낮은 변동성" : score >= 12 ? "낮은 변동성" : score >= 8 ? "보통 변동성" : score >= 4 ? "높은 변동성" : "매우 높은 변동성";
    return { score, label, detail: `연환산 변동성 ${vol20.toFixed(1)}%` };
  } catch {
    return { score: 10, label: "데이터 오류", detail: "" };
  }
}

/* ── 2. 코스피 모멘텀 (20점) ── */
async function scoreMomentum() {
  try {
    const now = new Date();
    const start = new Date(now.getTime() - 90 * 86400000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart("^KS11", {
      period1: start,
      period2: now,
      interval: "1d",
    });
    const closes = result.quotes.map((q: { close: number }) => q.close).filter(Boolean);
    const current = closes[closes.length - 1];
    const ma20 = closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
    const deviation = ((current - ma20) / ma20) * 100;

    const score = Math.round(Math.max(0, Math.min(20, ((deviation + 5) / 10) * 20)) * 10) / 10;
    const label = score >= 16 ? "강한 상승 추세" : score >= 12 ? "상승 추세" : score >= 8 ? "중립" : score >= 4 ? "하락 추세" : "강한 하락 추세";
    const dir = deviation >= 0 ? "위" : "아래";
    return { score, label, detail: `20일MA ${dir} ${Math.abs(deviation).toFixed(1)}% (현재 ${current.toLocaleString("ko-KR", { maximumFractionDigits: 0 })})` };
  } catch {
    return { score: 10, label: "데이터 오류", detail: "" };
  }
}

/* ── 3. 거래량 모멘텀 (20점) ── */
async function scoreVolume() {
  try {
    const now = new Date();
    const start = new Date(now.getTime() - 90 * 86400000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart("069500.KS", {
      period1: start,
      period2: now,
      interval: "1d",
    });
    const volumes = result.quotes.map((q: { volume: number }) => q.volume).filter(Boolean);
    const todayVol = volumes[volumes.length - 1];
    const avg20 = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
    const ratio = todayVol / avg20;

    const score = Math.round(Math.max(0, Math.min(20, ((ratio - 0.5) / 1.5) * 20)) * 10) / 10;
    const label = score >= 16 ? "매우 높은 거래량" : score >= 12 ? "높은 거래량" : score >= 8 ? "평균 거래량" : score >= 4 ? "낮은 거래량" : "매우 낮은 거래량";
    return { score, label, detail: `20일 평균 대비 ${ratio.toFixed(2)}x` };
  } catch {
    return { score: 10, label: "데이터 오류", detail: "" };
  }
}

/* ── 4. 미국 CNN Fear & Greed (20점) ── */
async function scoreUSFearGreed() {
  try {
    const resp = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
    );
    const data = await resp.json();
    const usScore = data.fear_and_greed.score as number;
    const rating = (data.fear_and_greed.rating as string).toLowerCase();

    const score = Math.round((usScore / 100) * 20 * 10) / 10;
    const labelMap: Record<string, string> = {
      "extreme fear": "극도의 공포", fear: "공포", neutral: "중립", greed: "탐욕", "extreme greed": "극도의 탐욕",
    };
    return { score, label: `미국 ${labelMap[rating] || rating} (${usScore.toFixed(0)})`, detail: `CNN F&G: ${usScore.toFixed(0)}/100` };
  } catch {
    return { score: 10, label: "데이터 오류", detail: "" };
  }
}

/* ── 5. 유튜브 심리 (20점) ── */
async function scoreYoutubeSentiment() {
  try {
    const { data } = await supabase
      .from("youtube_insights")
      .select("market_sentiment")
      .order("processed_at", { ascending: false })
      .limit(20);

    if (!data || data.length === 0) return { score: 10, label: "데이터 없음", detail: "" };

    const map: Record<string, number> = { 긍정: 1, 중립: 0, 부정: -1 };
    const scores = data.map((d) => map[d.market_sentiment] ?? 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const pos = scores.filter((s) => s === 1).length;
    const neg = scores.filter((s) => s === -1).length;

    // avg: -1~+1 → score: 0~20
    const score = Math.round(((avg + 1) / 2) * 20 * 10) / 10;
    const label = avg > 0.2 ? "유튜브 긍정" : avg < -0.2 ? "유튜브 부정" : "유튜브 중립";
    return { score, label, detail: `긍정 ${pos}개 / 부정 ${neg}개` };
  } catch {
    return { score: 10, label: "데이터 오류", detail: "" };
  }
}

/* ── 섹터별 심리 ── */
async function sectorSentiment() {
  try {
    const { data } = await supabase
      .from("youtube_insights")
      .select("key_sectors, market_sentiment")
      .order("processed_at", { ascending: false })
      .limit(100);

    if (!data) return [];

    const sectorMap: Record<string, { 긍정: number; 중립: number; 부정: number; total: number }> = {};
    for (const row of data) {
      const sectors: string[] = row.key_sectors || [];
      for (const s of sectors) {
        if (!sectorMap[s]) sectorMap[s] = { 긍정: 0, 중립: 0, 부정: 0, total: 0 };
        const key = (row.market_sentiment || "중립") as "긍정" | "중립" | "부정";
        sectorMap[s][key]++;
        sectorMap[s].total++;
      }
    }

    return Object.entries(sectorMap)
      .filter(([, v]) => v.total >= 3)
      .map(([name, v]) => {
        const scoreMap = { 긍정: 1, 중립: 0, 부정: -1 };
        const avg = (v.긍정 * scoreMap.긍정 + v.중립 * scoreMap.중립 + v.부정 * scoreMap.부정) / v.total;
        const label = avg > 0.2 ? "긍정" : avg < -0.2 ? "부정" : "중립";
        return { name, score: Math.round(avg * 100) / 100, label, ...v };
      })
      .sort((a, b) => b.total - a.total);
  } catch {
    return [];
  }
}

/* ── API Handler ── */
export async function GET() {
  const [volatility, momentum, volume, usFearGreed, youtube, sectors] =
    await Promise.all([
      scoreVolatility(),
      scoreMomentum(),
      scoreVolume(),
      scoreUSFearGreed(),
      scoreYoutubeSentiment(),
      sectorSentiment(),
    ]);

  const total = Math.round(
    (volatility.score + momentum.score + volume.score + usFearGreed.score + youtube.score) * 10
  ) / 10;

  const label =
    total >= 81 ? "극도의 탐욕" : total >= 61 ? "탐욕" : total >= 41 ? "중립" : total >= 21 ? "공포" : "극도의 공포";

  return NextResponse.json({
    score: total,
    label,
    components: { volatility, momentum, volume, usFearGreed, youtube },
    sectors,
  });
}
