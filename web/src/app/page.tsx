import Link from "next/link";
import { SentimentCard } from "@/components/SentimentCard";
import { TopStocks } from "@/components/TopStocks";
import { ThemeScanner } from "@/components/ThemeScanner";
import { MainTabs } from "@/components/MainTabs";
import { SearchBar } from "@/components/SearchBar";

export const revalidate = 300;

export default function Home() {
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header style={{ background: "#ffffff", borderBottom: "1px solid var(--border)", padding: "16px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <p style={{ fontSize: 11, letterSpacing: 3, color: "var(--blue)", fontWeight: 700, marginBottom: 2 }}>KOREA STOCK AI</p>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", letterSpacing: -0.5 }}>주식 AI 대시보드</h1>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/portfolio" style={{ padding: "9px 18px", borderRadius: 10, background: "#e8f3ff", color: "var(--blue)", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
              가상투자
            </Link>
            <Link href="/briefing" style={{ padding: "9px 18px", borderRadius: 10, background: "var(--blue)", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
              오늘의 브리핑
            </Link>
            <SearchBar />
          </div>
        </div>
      </header>

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
