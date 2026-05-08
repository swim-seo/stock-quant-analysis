import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { SentimentCard } from "@/components/SentimentCard";
import { TopStocks } from "@/components/TopStocks";
import { ThemeScanner } from "@/components/ThemeScanner";
import { MainTabs } from "@/components/MainTabs";
import { SearchBar } from "@/components/SearchBar";
import { PipelineAlerts } from "@/components/PipelineAlerts";
import { UpdateButton } from "@/components/UpdateButton";

export const revalidate = 300;

async function getLastUpdated(): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase
    .from("stock_news")
    .select("collected_at")
    .order("collected_at", { ascending: false })
    .limit(1)
    .single();

  if (!data?.collected_at) return "";
  const d = new Date(data.collected_at);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function Home() {
  const lastUpdated = await getLastUpdated();

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header style={{ background: "#ffffff", borderBottom: "1px solid var(--border)", padding: "12px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* 좌: 로고 + 업데이트 정보 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <p style={{ fontSize: 10, letterSpacing: 3, color: "var(--blue)", fontWeight: 700, margin: 0 }}>KOREA STOCK AI</p>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-1)", letterSpacing: -0.5, margin: 0 }}>주식 AI 대시보드</h1>
            </Link>
            {lastUpdated && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#aaa" }}>업데이트 {lastUpdated}</span>
                <UpdateButton compact />
              </div>
            )}
          </div>
          {/* 우: 네비게이션 */}
          <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link href="/screener" style={{ padding: "7px 14px", borderRadius: 8, background: "#e8f3ff", color: "var(--blue)", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
              퀀트 스크리너
            </Link>
            <Link href="/portfolio" style={{ padding: "7px 14px", borderRadius: 8, background: "#f5f5f5", color: "var(--text-2)", fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
              가상투자
            </Link>
            <Link href="/briefing" style={{ padding: "7px 14px", borderRadius: 8, background: "var(--blue)", color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
              오늘의 브리핑
            </Link>
            <SearchBar />
          </nav>
        </div>
      </header>

      <PipelineAlerts />

      {/* Dashboard Grid */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px", display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}>
        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SentimentCard />
          <TopStocks />
          <ThemeScanner />
        </div>

        {/* Right */}
        <div>
          <MainTabs />
        </div>
      </div>
    </main>
  );
}
