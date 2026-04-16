import { SentimentCard } from "@/components/SentimentCard";
import { TopStocks } from "@/components/TopStocks";
import { MainTabs } from "@/components/MainTabs";
import { SearchBar } from "@/components/SearchBar";

export const revalidate = 300;

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[#1e1e28] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-[4px] text-[#f0a500] font-bold mb-1">
              KOREA STOCK AI SYSTEM
            </p>
            <h1 className="text-xl font-bold text-white">
              주식 AI 대시보드
            </h1>
          </div>
          <SearchBar />
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
