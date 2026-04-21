"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InsightsFeed } from "./InsightsFeed";
import { HotSectors } from "./HotSectors";
import { searchByStock } from "@/lib/api";
import type { YoutubeInsight } from "@/lib/types";

const POPULAR_STOCKS = [
  "삼성전자", "SK하이닉스", "현대차", "카카오", "NAVER",
  "LG에너지솔루션", "셀트리온", "기아", "삼성SDI", "한미반도체",
];

function StockSearchPanel() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YoutubeInsight[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = (name: string) => {
    setQuery(name);
    setLoading(true);
    setSearched(true);
    searchByStock(name, 10).then((data) => {
      setResults(data);
      setLoading(false);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) handleSearch(query.trim());
  };

  return (
    <div>
      {/* 검색 입력 */}
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목명을 입력하세요 (예: 삼성전자)"
            className="flex-1 px-4 py-2.5 text-sm bg-[#111118] border border-[#2a2a3a] rounded-lg text-white placeholder-[#aaaaaa] focus:outline-none focus:border-[#ffd700] transition-colors"
          />
          <button
            type="submit"
            className="px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors"
            style={{ background: "#ffd700", color: "#0a0a12" }}
          >
            검색
          </button>
        </div>
      </form>

      {/* 인기 종목 빠른 검색 */}
      <div className="flex flex-wrap gap-2 mb-5">
        {POPULAR_STOCKS.map((name) => (
          <button
            key={name}
            onClick={() => handleSearch(name)}
            className="px-3 py-1.5 text-[11px] rounded-full border border-[#2a2a3a] text-[#8a8a9a] hover:border-[#ffd700] hover:text-[#ffd700] transition-colors"
          >
            {name}
          </button>
        ))}
      </div>

      {/* 종목 차트 바로가기 */}
      {query.trim() && (
        <button
          onClick={() => router.push(`/stock?ticker=${encodeURIComponent(query.trim())}`)}
          className="w-full mb-4 py-3 text-sm font-semibold rounded-xl border border-[#2a2a3e] text-[#ffffff] hover:border-[#ffd700] hover:text-[#ffd700] transition-colors"
          style={{ background: "#111118" }}
        >
          📊 &quot;{query.trim()}&quot; 차트 분석 보기 →
        </button>
      )}

      {/* 검색 결과 */}
      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-[#2a2a3a] rounded w-3/4 mb-2" />
              <div className="h-3 bg-[#2a2a3a] rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-8 text-center">
          <p className="text-sm text-[#aaaaaa]">&quot;{query}&quot; 관련 인사이트가 없습니다.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-[#aaaaaa] mb-2">{results.length}개 결과</p>
          {results.map((item) => {
            const sentColor =
              item.market_sentiment === "긍정" ? "#00ff88" : item.market_sentiment === "부정" ? "#ff4444" : "#ffd700";
            return (
              <div
                key={item.video_id}
                className="bg-[#111118] border border-[#2a2a3a] rounded-xl overflow-hidden hover:border-[#2a2a3e] transition-colors"
              >
                <div className="flex gap-3 p-3">
                  {/* 썸네일 */}
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <img
                      src={`https://img.youtube.com/vi/${item.video_id}/mqdefault.jpg`}
                      alt=""
                      className="w-32 h-20 object-cover rounded-lg"
                      loading="lazy"
                    />
                  </a>
                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: sentColor, background: `${sentColor}15` }}
                      >
                        {item.market_sentiment}
                      </span>
                      <span className="text-xs text-[#aaaaaa]">{item.channel}</span>
                    </div>
                    <h3 className="text-xs font-semibold text-[#ffffff] line-clamp-2 mb-1">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-[#8a8a9a] line-clamp-1">{item.summary}</p>
                    {/* 종목 태그 */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(item.key_stocks || []).slice(0, 5).map((s) => (
                        <span
                          key={s}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-[#4d9fff10] text-[#4d9fff] border border-[#4d9fff30]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MainTabs() {
  const [tab, setTab] = useState<"search" | "insights" | "hot">("hot");

  return (
    <div>
      {/* 탭 버튼 */}
      <div className="flex gap-1 mb-5 bg-[#111118] p-1 rounded-lg border border-[#2a2a3a]">
        <button
          onClick={() => setTab("hot")}
          className="flex-1 py-2 text-xs font-semibold rounded-md transition-colors"
          style={{
            background: tab === "hot" ? "#2a2a3a" : "transparent",
            color: tab === "hot" ? "#ffffff" : "#aaaaaa",
          }}
        >
          🔥 거래량
        </button>
        <button
          onClick={() => setTab("search")}
          className="flex-1 py-2 text-xs font-semibold rounded-md transition-colors"
          style={{
            background: tab === "search" ? "#2a2a3a" : "transparent",
            color: tab === "search" ? "#ffffff" : "#aaaaaa",
          }}
        >
          종목 검색
        </button>
        <button
          onClick={() => setTab("insights")}
          className="flex-1 py-2 text-xs font-semibold rounded-md transition-colors"
          style={{
            background: tab === "insights" ? "#2a2a3a" : "transparent",
            color: tab === "insights" ? "#ffffff" : "#aaaaaa",
          }}
        >
          최근 인사이트
        </button>
      </div>

      {tab === "hot" && <HotSectors />}
      {tab === "insights" && <InsightsFeed />}
      {tab === "search" && <StockSearchPanel />}
    </div>
  );
}
