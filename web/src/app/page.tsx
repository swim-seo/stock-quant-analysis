import Link from "next/link";
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
    const base = process.env.NEXT_PUBLIC_SITE_URL
      ?? process.env.VERCEL_URL
      ?? "http://localhost:3000";
    const url = base.startsWith("http") ? base : `https://${base}`;
    const res = await fetch(`${url}/api/home-summary`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
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
              <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)", letterSpacing: -0.5, margin: 0 }}>주식 AI 대시보드</h1>
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
