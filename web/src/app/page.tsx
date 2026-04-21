import Link from "next/link";
import { SentimentCard } from "@/components/SentimentCard";
import { TopStocks } from "@/components/TopStocks";
import { MainTabs } from "@/components/MainTabs";
import { SearchBar } from "@/components/SearchBar";

export const revalidate = 300;

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[#2a2a3a] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-[4px] text-[#ffd700] font-bold mb-1">
              KOREA STOCK AI SYSTEM
            </p>
            <h1 className="text-xl font-bold text-white">
              주식 AI 대시보드
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/portfolio"
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-colors"
              style={{ background: "#00ff8815", color: "#00ff88", border: "1px solid #00ff8840" }}
            >
              가상 투자
            </Link>
            <Link
              href="/briefing"
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-colors"
              style={{ background: "#ffd70015", color: "#ffd700", border: "1px solid #ffd70040" }}
            >
              오늘의 브리핑
            </Link>
            <SearchBar />
          </div>
        </div>
      </header>

      {/* Dashboard Grid */}
      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: 공포탐욕 + 종목 랭킹 */}
        <div className="space-y-6">
          <SentimentCard />
          <TopStocks />
        </div>

        {/* Right: 탭 (인사이트 / 종목 검색) */}
        <div className="lg:col-span-2">
          <MainTabs />
        </div>
      </div>
    </main>
  );
}
