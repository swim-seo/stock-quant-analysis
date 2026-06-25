import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  // 1. 시장 위험도 + 국면 (최신 trade_signals 1행)
  const { data: latestSignal } = await supabase
    .from("trade_signals")
    .select("market_risk_level,market_risk_score,market_regime,calculated_at")
    .order("calculated_at", { ascending: false })
    .limit(1)
    .single();

  // 2. execution_signal 분포
  const { data: allSignals } = await supabase
    .from("trade_signals")
    .select("ticker,stock_name,signal,execution_signal,composite_score,data_freshness_score,suggested_position_pct,take_profit_pct,stop_loss_pct,max_holding_days,market_risk_level,execution_reason")
    .order("composite_score", { ascending: false });

  const signals = allSignals ?? [];
  const buyOk    = signals.filter(s => s.execution_signal === "BUY_OK");
  const buySmall = signals.filter(s => s.execution_signal === "BUY_SMALL");
  const blocked  = signals.filter(s => s.execution_signal === "BLOCKED");
  const watch    = signals.filter(s => s.execution_signal === "WATCH");

  // 3. 오늘 뉴스 호재 (catalyst 판단)
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
    .toISOString().split("T")[0];
  const { data: newsHot } = await supabase
    .from("stock_news")
    .select("stock_name,sentiment,news_impact_score")
    .eq("sentiment", "호재")
    .gte("collected_at", `${today}T00:00:00`)
    .order("news_impact_score", { ascending: false });

  const catalystSet = new Set((newsHot ?? []).map(n => n.stock_name));

  // 4. TOP 3 매수 후보 (BUY_OK 우선 → BUY_SMALL)
  const candidates = [...buyOk, ...buySmall].slice(0, 3).map(s => ({
    ticker:            s.ticker,
    stock_name:        s.stock_name,
    execution_signal:  s.execution_signal,
    composite_score:   s.composite_score,
    freshness_score:   s.data_freshness_score,
    has_catalyst:      catalystSet.has(s.stock_name),
    position_pct:      s.suggested_position_pct,
    take_profit_pct:   s.take_profit_pct,
    stop_loss_pct:     s.stop_loss_pct,
    max_holding_days:  s.max_holding_days,
    market_risk_level: s.market_risk_level,
  }));

  // 5. 주의/진입금지 TOP 3 (BLOCKED 우선, 그다음 freshness 낮은 것)
  const lowFreshness = watch
    .filter(s => (s.data_freshness_score ?? 100) < 60)
    .sort((a, b) => (a.data_freshness_score ?? 100) - (b.data_freshness_score ?? 100));

  const warnings = [
    ...blocked.slice(0, 3).map(s => ({
      stock_name: s.stock_name,
      reason:     s.execution_reason ?? "공시 또는 시장 위험",
      type:       "blocked" as const,
    })),
    ...lowFreshness.slice(0, Math.max(0, 3 - blocked.length)).map(s => ({
      stock_name: s.stock_name,
      reason:     `데이터 신선도 낮음 (${s.data_freshness_score}점)`,
      type:       "stale" as const,
    })),
  ].slice(0, 3);

  // 6. 데이터 신선도 전체 평균
  const freshScores = signals.map(s => s.data_freshness_score ?? 0).filter(Boolean);
  const avgFreshness = freshScores.length
    ? Math.round(freshScores.reduce((a, b) => a + b, 0) / freshScores.length)
    : null;

  // 7. 오늘 판단 요약 문구
  const riskLevel = latestSignal?.market_risk_level ?? "UNKNOWN";
  const decisionText =
    riskLevel === "LOW"     ? "BUY_OK 신호 적극 검토 가능합니다." :
    riskLevel === "MEDIUM"  ? "BUY_OK 위주로 소액 검토하세요." :
    riskLevel === "HIGH"    ? "무리한 신규 진입보다 BUY_OK만 소액 검토하세요." :
    riskLevel === "EXTREME" ? "신규 진입 자제. 기존 포지션 점검 우선입니다." :
    "시장 데이터를 확인 중입니다.";

  const toStockList = (arr: typeof signals) =>
    arr.map(s => ({ ticker: s.ticker, stock_name: s.stock_name, composite_score: s.composite_score }));

  return NextResponse.json({
    updated_at:        latestSignal?.calculated_at ?? null,
    market_risk_level: riskLevel,
    market_risk_score: latestSignal?.market_risk_score ?? null,
    market_regime:     latestSignal?.market_regime ?? null,
    buy_ok_count:      buyOk.length,
    buy_small_count:   buySmall.length,
    watch_count:       watch.length,
    blocked_count:     blocked.length,
    buy_ok_list:       toStockList(buyOk),
    buy_small_list:    toStockList(buySmall),
    watch_list:        toStockList(watch),
    blocked_list:      toStockList(blocked),
    avg_freshness:     avgFreshness,
    decision_text:     decisionText,
    top_candidates:    candidates,
    risk_warnings:     warnings,
  });
}
