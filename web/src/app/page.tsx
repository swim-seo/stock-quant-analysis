import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { TodayDecisionCard } from "./components/home/TodayDecisionCard";
import { TodayBuyCandidates } from "./components/home/TodayBuyCandidates";
import { RiskWarningList } from "./components/home/RiskWarningList";
import { UpdateButton } from "@/components/UpdateButton";
import { SentimentCard } from "@/components/SentimentCard";
import { TopStocks } from "@/components/TopStocks";
import { ThemeScanner } from "@/components/ThemeScanner";
import { MainTabs } from "@/components/MainTabs";
import { PipelineAlerts } from "@/components/PipelineAlerts";
import { SearchBar } from "@/components/SearchBar";

export const revalidate = 60;

async function getHomeSummary() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const [{ data: latestSignal }, { data: allSignals }] = await Promise.all([
      supabase
        .from("trade_signals")
        .select("market_risk_level,market_risk_score,market_regime,calculated_at")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from("trade_signals")
        .select("ticker,stock_name,execution_signal,composite_score,data_freshness_score,suggested_position_pct,take_profit_pct,stop_loss_pct,max_holding_days,market_risk_level,execution_reason")
        .order("composite_score", { ascending: false }),
    ]);

    type SR = {
      ticker: string; stock_name: string; execution_signal: string;
      composite_score: number; data_freshness_score: number | null;
      suggested_position_pct: number | null; take_profit_pct: number | null;
      stop_loss_pct: number | null; max_holding_days: number | null;
      market_risk_level: string; execution_reason: string | null;
    };
    const signals = (allSignals ?? []) as SR[];
    const buyOk    = signals.filter(s => s.execution_signal === "BUY_OK");
    const buySmall = signals.filter(s => s.execution_signal === "BUY_SMALL");
    const blocked  = signals.filter(s => s.execution_signal === "BLOCKED");
    const watch    = signals.filter(s => s.execution_signal === "WATCH");

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const { data: newsHot } = await supabase
      .from("stock_news")
      .select("stock_name")
      .eq("sentiment", "호재")
      .gte("collected_at", `${today}T00:00:00`);
    const catalystSet = new Set((newsHot ?? []).map((n: { stock_name: string }) => n.stock_name));

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

    const freshScores = signals
      .map(s => s.data_freshness_score ?? 0)
      .filter(Boolean);
    const avgFreshness = freshScores.length
      ? Math.round(freshScores.reduce((a: number, b: number) => a + b, 0) / freshScores.length)
      : null;

    const riskLevel = latestSignal?.market_risk_level ?? "UNKNOWN";
    const decisionText =
      riskLevel === "LOW"     ? "BUY_OK 신호 적극 검토 가능합니다." :
      riskLevel === "MEDIUM"  ? "BUY_OK 위주로 소액 검토하세요." :
      riskLevel === "HIGH"    ? "무리한 신규 진입보다 BUY_OK만 소액 검토하세요." :
      riskLevel === "EXTREME" ? "신규 진입 자제. 기존 포지션 점검 우선입니다." :
      "시장 데이터를 확인 중입니다.";

    return {
      updated_at:        latestSignal?.calculated_at ?? null,
      market_risk_level: riskLevel,
      market_risk_score: latestSignal?.market_risk_score ?? null,
      market_regime:     latestSignal?.market_regime ?? null,
      buy_ok_count:      buyOk.length,
      buy_small_count:   buySmall.length,
      watch_count:       watch.length,
      blocked_count:     blocked.length,
      avg_freshness:     avgFreshness,
      decision_text:     decisionText,
      top_candidates:    candidates,
      risk_warnings:     warnings,
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  const summary = await getHomeSummary();

  return (
    <main style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {/* ── 헤더 ────────────────────────────────── */}
      <header style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "12px 16px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* 로고 행 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <p style={{ fontSize: 9, letterSpacing: 3, color: "var(--blue)", fontWeight: 700, margin: 0 }}>KOREA STOCK AI</p>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)", letterSpacing: -0.5, margin: "0 0 1px" }}>주식 AI 대시보드</h1>
              <p style={{ fontSize: 10, color: "#aaa", margin: 0 }}>
                {summary?.updated_at
                  ? `최신 업데이트 ${new Date(summary.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                  : "데이터 로딩 중..."}
              </p>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Link href="/chat" style={{ padding: "7px 13px", borderRadius: 8, background: "linear-gradient(135deg,#6c47ff,#a78bfa)", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                💬 AI 상담
              </Link>
              <Link href="/briefing" style={{ padding: "7px 13px", borderRadius: 8, background: "var(--blue)", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                📰 브리핑
              </Link>
              <SearchBar />
            </div>
          </div>
          {/* 주 네비 — 3개 그룹 */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
            <Link href="/signals?tab=sniper" style={{ padding: "8px 16px", borderRadius: 10, background: "linear-gradient(135deg,#f04452,#f5a623)", color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
              ⚡ 오늘 매수
            </Link>
            <Link href="/signals" style={{ padding: "8px 16px", borderRadius: 10, background: "#fff0f0", color: "#f04452", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
              📡 전체 신호
            </Link>
            <Link href="/screener" style={{ padding: "8px 16px", borderRadius: 10, background: "#e8f3ff", color: "var(--blue)", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
              🔍 종목 찾기
            </Link>
            <Link href="/portfolio" style={{ padding: "8px 16px", borderRadius: 10, background: "#f0fdf4", color: "#00b493", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
              📊 성과 검증
            </Link>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <UpdateButton compact />
            </div>
          </div>
        </div>
      </header>

      <PipelineAlerts />

      {/* ── 메인 콘텐츠 ─────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 16px" }}>

        {/* 1순위: 오늘의 결론 + 매수 후보 + 주의 (항상 최상단) */}
        {summary ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            <TodayDecisionCard data={summary} />
            <TodayBuyCandidates candidates={summary.top_candidates ?? []} />
            {(summary.risk_warnings ?? []).length > 0 && (
              <RiskWarningList warnings={summary.risk_warnings} />
            )}
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, marginBottom: 20, textAlign: "center", border: "1px solid var(--border)" }}>
            <p style={{ color: "#8b95a1" }}>시장 데이터 로딩 중...</p>
          </div>
        )}

        {/* 2순위: 보조 지표 (기본 접힘) */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: "#8b95a1", fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>보조 지표 더 보기</p>
          <div className="grid-home">
            {/* 좌: 감성 + 인기 종목 + 테마 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SentimentCard />
              <TopStocks />
              <ThemeScanner />
            </div>
            {/* 우: 메인 탭 (유튜브/뉴스/섹터 등) */}
            <div>
              <MainTabs />
            </div>
          </div>
        </div>

        {/* 하단 더 보기 링크 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", padding: "12px 0" }}>
          {[
            { href: "/signals",  label: "전체 신호" },
            { href: "/screener", label: "종목 찾기" },
            { href: "/portfolio",label: "성과 검증" },
            { href: "/briefing", label: "브리핑"   },
          ].map(l => (
            <Link key={l.href} href={l.href} style={{
              padding: "8px 16px", borderRadius: 10,
              background: "#fff", border: "1px solid var(--border)",
              fontSize: 13, color: "var(--text-2)", textDecoration: "none", fontWeight: 600,
            }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
