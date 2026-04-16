"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { searchByStock } from "@/lib/api";
import type { YoutubeInsight } from "@/lib/types";
import Link from "next/link";
import { Suspense } from "react";

function SentimentDot({ sentiment }: { sentiment: string }) {
  const color =
    sentiment === "긍정"
      ? "#00ff88"
      : sentiment === "부정"
        ? "#ff4444"
        : "#ffd700";
  return (
    <span
      className="inline-block w-2 h-2 rounded-full mr-1.5"
      style={{ backgroundColor: color }}
    />
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const [results, setResults] = useState<YoutubeInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (query) {
      setLoading(true);
      searchByStock(query, 20).then((data) => {
        setResults(data);
        setLoading(false);
      });
    }
  }, [query]);

  return (
    <main className="min-h-screen">
      <header className="border-b border-[#2a2a3a] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link
            href="/"
            className="text-[#aaaaaa] hover:text-white transition-colors"
          >
            ← 대시보드
          </Link>
          <h1 className="text-lg font-bold text-white">
            &ldquo;{query}&rdquo; 검색 결과
          </h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-4 animate-pulse"
              >
                <div className="h-4 bg-[#2a2a3a] rounded w-3/4 mb-2" />
                <div className="h-3 bg-[#2a2a3a] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-8 text-center">
            <p className="text-[#aaaaaa]">
              &ldquo;{query}&rdquo; 관련 인사이트가 없습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[#555] mb-4">{results.length}개 결과</p>
            {results.map((item) => {
              let signals: string[] = [];
              try {
                signals =
                  typeof item.investment_signals === "string"
                    ? JSON.parse(item.investment_signals)
                    : item.investment_signals || [];
              } catch {
                signals = [];
              }

              return (
                <div
                  key={item.video_id}
                  className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-4 hover:border-[#2a2a3e] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <SentimentDot sentiment={item.market_sentiment} />
                    <span className="text-[10px] text-[#aaaaaa]">
                      {item.channel}
                    </span>
                    <span className="text-[10px] text-[#555]">
                      {item.trading_type}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-white mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[#999] mb-3 line-clamp-2">
                    {item.summary}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(item.key_stocks || []).map((s) => (
                      <span
                        key={s}
                        className="text-[10px] px-2 py-0.5 rounded bg-[#4d9fff10] text-[#4d9fff] border border-[#4d9fff30]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  {signals.length > 0 && (
                    <div className="mb-3">
                      {signals.slice(0, 2).map((s, i) => (
                        <p key={i} className="text-[11px] text-[#888]">
                          · {s}
                        </p>
                      ))}
                    </div>
                  )}

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#ff6b35] hover:underline"
                  >
                    YouTube에서 보기 →
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-[#aaaaaa]">로딩 중...</p>
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
