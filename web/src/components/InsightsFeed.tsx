"use client";

import { useEffect, useState } from "react";
import { getLatestInsights } from "@/lib/api";
import type { YoutubeInsight } from "@/lib/types";

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const config: Record<string, { color: string; bg: string }> = {
    긍정: { color: "#00c853", bg: "#00c85315" },
    부정: { color: "#ff1744", bg: "#ff174415" },
    중립: { color: "#ffab00", bg: "#ffab0015" },
  };
  const { color, bg } = config[sentiment] || config["중립"];

  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color, backgroundColor: bg }}
    >
      {sentiment}
    </span>
  );
}

function TradingTypeBadge({ type }: { type: string }) {
  const config: Record<string, { color: string; bg: string }> = {
    단타: { color: "#ff6b35", bg: "#ff6b3515" },
    스윙: { color: "#2196f3", bg: "#2196f315" },
    장기: { color: "#9c6bff", bg: "#9c6bff15" },
  };
  const { color, bg } = config[type] || config["스윙"];

  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color, backgroundColor: bg }}
    >
      {type}
    </span>
  );
}

function InsightCard({ insight }: { insight: YoutubeInsight }) {
  const [open, setOpen] = useState(false);
  const stocks = insight.key_stocks || [];
  const sectors = insight.key_sectors || [];
  let signals: string[] = [];
  try {
    signals =
      typeof insight.investment_signals === "string"
        ? JSON.parse(insight.investment_signals)
        : insight.investment_signals || [];
  } catch {
    signals = [];
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "방금 전";
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  };

  return (
    <div className="bg-[#111118] border border-[#1e1e28] rounded-xl overflow-hidden transition-all hover:border-[#2a2a3e]">
      {/* Header - always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left p-4 flex items-start gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-[#7a7a8c]">
              {insight.channel}
            </span>
            <span className="text-[10px] text-[#555]">
              {insight.processed_at ? timeAgo(insight.processed_at) : ""}
            </span>
          </div>
          <h3 className="text-sm font-medium text-white truncate">
            {insight.title}
          </h3>
          <div className="flex gap-2 mt-2">
            <SentimentBadge sentiment={insight.market_sentiment} />
            <TradingTypeBadge type={insight.trading_type} />
            {insight.urgency === "오늘" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-[#ff1744] bg-[#ff174415]">
                긴급
              </span>
            )}
          </div>
        </div>
        <span className="text-[#555] text-lg mt-1">{open ? "−" : "+"}</span>
      </button>

      {/* Detail - expandable */}
      {open && (
        <div className="px-4 pb-4 border-t border-[#1e1e28] pt-3 space-y-3">
          {/* Summary */}
          <p className="text-sm text-[#c0c0c0] leading-relaxed">
            {insight.summary}
          </p>

          {/* Stocks & Sectors */}
          <div className="flex flex-wrap gap-1.5">
            {stocks.map((s) => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded bg-[#2196f310] text-[#2196f3] border border-[#2196f330]"
              >
                {s}
              </span>
            ))}
            {sectors.map((s) => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded bg-[#9c6bff10] text-[#9c6bff] border border-[#9c6bff30]"
              >
                {s}
              </span>
            ))}
          </div>

          {/* Signals */}
          {signals.length > 0 && (
            <div>
              <p className="text-[10px] text-[#7a7a8c] mb-1">투자 신호</p>
              {signals.slice(0, 3).map((s, i) => (
                <p key={i} className="text-xs text-[#999] ml-2">
                  · {s}
                </p>
              ))}
            </div>
          )}

          {/* YouTube link */}
          <a
            href={insight.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#ff6b35] hover:underline"
          >
            YouTube에서 보기 →
          </a>
        </div>
      )}
    </div>
  );
}

export function InsightsFeed() {
  const [insights, setInsights] = useState<YoutubeInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLatestInsights(20).then((data) => {
      setInsights(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-[#7a7a8c] tracking-widest">
          최근 인사이트
        </h2>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="bg-[#111118] border border-[#1e1e28] rounded-xl p-4 animate-pulse"
          >
            <div className="h-3 bg-[#1e1e28] rounded w-1/4 mb-3" />
            <div className="h-4 bg-[#1e1e28] rounded w-3/4 mb-2" />
            <div className="h-3 bg-[#1e1e28] rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xs font-semibold text-[#7a7a8c] tracking-widest">
          최근 인사이트
        </h2>
        <span className="text-[10px] text-[#555]">{insights.length}개</span>
      </div>

      {insights.length === 0 ? (
        <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-8 text-center">
          <p className="text-sm text-[#555]">수집된 인사이트가 없습니다.</p>
        </div>
      ) : (
        insights.map((insight) => (
          <InsightCard key={insight.video_id} insight={insight} />
        ))
      )}
    </div>
  );
}
