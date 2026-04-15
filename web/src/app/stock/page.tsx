"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { StockChart } from "@/components/StockChart";
import { resolveTickerInput, TICKER_TO_NAME } from "@/lib/stocks";
import { searchByStock } from "@/lib/api";
import type { YoutubeInsight } from "@/lib/types";

interface StockData {
  ticker: string;
  name: string;
  quotes: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
}

function SentimentDot({ sentiment }: { sentiment: string }) {
  const color = sentiment === "긍정" ? "#00c853" : sentiment === "부정" ? "#ff1744" : "#ffab00";
  return <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: color }} />;
}

function StockContent() {
  const searchParams = useSearchParams();
  const rawTicker = searchParams.get("ticker") || "";
  const ticker = resolveTickerInput(rawTicker);

  const [data, setData] = useState<StockData | null>(null);
  const [period, setPeriod] = useState("1y");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState<YoutubeInsight[]>([]);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError("");

    fetch(`/api/stock?ticker=${encodeURIComponent(ticker)}&period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          setData(null);
        } else {
          setData(d);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("데이터를 가져올 수 없습니다.");
        setLoading(false);
      });
  }, [ticker, period]);

  // 관련 유튜브 인사이트 검색
  useEffect(() => {
    if (!ticker) return;
    const name = TICKER_TO_NAME[ticker] || rawTicker;
    searchByStock(name, 5).then(setInsights);
  }, [ticker, rawTicker]);

  const displayName = data?.name || TICKER_TO_NAME[ticker] || rawTicker;

  return (
    <main className="min-h-screen">
      <header className="border-b border-[#1e1e28] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/" className="text-[#7a7a8c] hover:text-white transition-colors">
            ← 대시보드
          </Link>
          <h1 className="text-lg font-bold text-white">{displayName}</h1>
          <span className="text-xs text-[#555]">{ticker}</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {loading ? (
          <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-16 text-center animate-pulse">
            <p className="text-[#7a7a8c]">차트 로딩 중...</p>
          </div>
        ) : error ? (
          <div className="bg-[#111118] border border-[#ff174430] rounded-xl p-8 text-center">
            <p className="text-[#ff1744] mb-2">데이터를 가져올 수 없습니다</p>
            <p className="text-xs text-[#555]">{error}</p>
          </div>
        ) : data ? (
          <StockChart data={data} period={period} onPeriodChange={setPeriod} />
        ) : null}

        {/* 관련 유튜브 인사이트 */}
        {insights.length > 0 && (
          <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-6">
            <h2 className="text-xs font-semibold text-[#7a7a8c] tracking-widest mb-4">
              관련 유튜브 인사이트
            </h2>
            <div className="space-y-3">
              {insights.map((item) => (
                <div key={item.video_id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-[#0a0a12] transition-colors">
                  <SentimentDot sentiment={item.market_sentiment} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.title}</p>
                    <p className="text-xs text-[#7a7a8c] mt-1 line-clamp-1">{item.summary}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-[#555]">{item.channel}</span>
                      <span className="text-[10px] text-[#555]">{item.trading_type}</span>
                    </div>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#ff6b35] hover:underline whitespace-nowrap"
                  >
                    보기 →
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function StockPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-[#7a7a8c]">로딩 중...</p></div>}>
      <StockContent />
    </Suspense>
  );
}
