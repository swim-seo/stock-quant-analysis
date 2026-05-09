import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface FactorRow {
  ticker: string;
  stock_name: string;
  sector: string;
  composite_score: number;
  rank_total: number;
  momentum_3m: number;
  momentum_6m: number;
  relative_strength_3m: number;
  volatility_20d: number;
  foreign_flow_5d: number | null;
  institution_flow_5d: number | null;
  z_flow: number | null;
  calculated_at: string;
}

interface NewsRow {
  stock_code: string;
  trading_signal: string | null;
  sentiment: string | null;
  analysis: Record<string, unknown> | string | null;
}

function buildReasons(f: FactorRow, news: NewsRow | null): string[] {
  const reasons: string[] = [];

  // Momentum
  if (f.momentum_3m > 50) reasons.push(`3개월 모멘텀 +${f.momentum_3m.toFixed(0)}% — 강한 상승 추세`);
  else if (f.momentum_3m > 20) reasons.push(`3개월 모멘텀 +${f.momentum_3m.toFixed(0)}% — 완만한 상승`);

  // Relative strength
  if (f.relative_strength_3m > 30) reasons.push(`시장 대비 상대강도 +${f.relative_strength_3m.toFixed(0)}% — 코스피 대비 강세`);

  // Flow
  const foreign = f.foreign_flow_5d ?? 0;
  const inst = f.institution_flow_5d ?? 0;
  if (foreign > 0 && inst > 0) reasons.push(`외국인 +${Math.round(foreign / 1000)}K · 기관 +${Math.round(inst / 1000)}K (5일 순매수)`);
  else if (foreign > 0) reasons.push(`외국인 5일 순매수 +${Math.round(foreign / 1000)}K주`);
  else if (inst > 0) reasons.push(`기관 5일 순매수 +${Math.round(inst / 1000)}K주`);

  // News signal
  if (news?.trading_signal === "매수관심") reasons.push("뉴스 분석: 매수관심 신호 확인");
  else if (news?.sentiment === "긍정") reasons.push("뉴스 분석: 긍정 심리");

  // Score context
  reasons.push(`퀀트 종합점수 ${f.composite_score}점 — 131개 종목 중 상위 ${Math.round((1 - f.rank_total / 131) * 100)}%`);

  return reasons;
}

export async function GET() {
  // 1. factor_scores: sweet spot 45~78, exclude already-overextended (>78)
  const { data: factors, error: fErr } = await supabase
    .from("factor_scores")
    .select("ticker,stock_name,sector,composite_score,rank_total,momentum_3m,momentum_6m,relative_strength_3m,volatility_20d,foreign_flow_5d,institution_flow_5d,z_flow,calculated_at")
    .gte("composite_score", 45)
    .lte("composite_score", 78)
    .order("composite_score", { ascending: false })
    .limit(20);

  if (fErr || !factors || factors.length === 0) {
    return NextResponse.json({ stocks: [], calculated_at: null });
  }

  // 2. stock_news for these tickers
  const tickers = factors.map((f: FactorRow) => f.ticker);
  const { data: newsRows } = await supabase
    .from("stock_news")
    .select("stock_code,trading_signal,sentiment,analysis")
    .in("stock_code", tickers)
    .order("collected_at", { ascending: false });

  // latest news per ticker
  const newsMap = new Map<string, NewsRow>();
  for (const n of (newsRows ?? []) as NewsRow[]) {
    if (!newsMap.has(n.stock_code)) newsMap.set(n.stock_code, n);
  }

  // 3. Build result — prioritize stocks with positive news signal
  const stocks = (factors as FactorRow[]).map(f => {
    const news = newsMap.get(f.ticker) ?? null;
    const reasons = buildReasons(f, news);
    return {
      ticker: f.ticker,
      name: f.stock_name,
      sector: f.sector,
      composite_score: f.composite_score,
      momentum_3m: f.momentum_3m,
      momentum_6m: f.momentum_6m,
      relative_strength_3m: f.relative_strength_3m,
      volatility_20d: f.volatility_20d,
      trading_signal: news?.trading_signal ?? null,
      sentiment: news?.sentiment ?? null,
      reasons,
    };
  });

  // boost stocks with buy signal to top
  stocks.sort((a, b) => {
    const aBoost = a.trading_signal === "매수관심" ? 10 : 0;
    const bBoost = b.trading_signal === "매수관심" ? 10 : 0;
    return (b.composite_score + bBoost) - (a.composite_score + aBoost);
  });

  return NextResponse.json({
    stocks: stocks.slice(0, 8),
    calculated_at: (factors[0] as FactorRow).calculated_at,
  });
}
