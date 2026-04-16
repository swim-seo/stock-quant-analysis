"use client";

import { useEffect, useState } from "react";
import { getLatestInsights } from "@/lib/api";
import type { YoutubeInsight } from "@/lib/types";

function fmtDate(d: string | null) {
  if (!d) return "";
  if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  return d.slice(0, 10);
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const color =
    sentiment === "긍정" ? "#00ff88" : sentiment === "부정" ? "#ff4444" : "#ffd700";
  return (
    <span
      className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}
    >
      {sentiment}
    </span>
  );
}

function InsightCard({
  insight,
  expanded,
  onToggle,
}: {
  insight: YoutubeInsight;
  expanded: boolean;
  onToggle: () => void;
}) {
  const thumbUrl = `https://img.youtube.com/vi/${insight.video_id}/mqdefault.jpg`;

  let signals: string[] = [];
  try {
    signals =
      typeof insight.investment_signals === "string"
        ? JSON.parse(insight.investment_signals)
        : insight.investment_signals || [];
  } catch {
    signals = [];
  }

  return (
    <div
      className="bg-[#111118] border border-[#2a2a3a] rounded-xl overflow-hidden hover:border-[#2a2a3e] transition-all"
    >
      {/* 썸네일 */}
      <button onClick={onToggle} className="w-full text-left">
        <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
          <img
            src={thumbUrl}
            alt={insight.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* 오버레이 배지 */}
          <div className="absolute top-2 left-2 flex gap-1">
            <SentimentBadge sentiment={insight.market_sentiment} />
            {insight.trading_type && (
              <span
                className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  color: insight.trading_type === "단타" ? "#ff6b35" : insight.trading_type === "스윙" ? "#4d9fff" : "#9c6bff",
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(4px)",
                }}
              >
                {insight.trading_type}
              </span>
            )}
          </div>
          {insight.urgency === "오늘" && (
            <div className="absolute top-2 right-2">
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#ff4444] text-white">
                긴급
              </span>
            </div>
          )}
        </div>

        {/* 제목 영역 */}
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs text-[#aaaaaa]">{insight.channel}</span>
            <span className="text-xs text-[#aaaaaa]">
              {insight.processed_at ? timeAgo(insight.processed_at) : fmtDate(insight.upload_date)}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-[#ffffff] line-clamp-2 leading-snug">
            {insight.title}
          </h3>
        </div>
      </button>

      {/* 펼침 영역 */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-[#2a2a3a] pt-3 space-y-3">
          <p className="text-xs text-[#e0e0e0] leading-relaxed">{insight.summary}</p>

          {/* 종목 태그 */}
          {(insight.key_stocks || []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {insight.key_stocks.map((s) => (
                <span
                  key={s}
                  className="text-xs px-2 py-0.5 rounded bg-[#4d9fff10] text-[#4d9fff] border border-[#4d9fff30]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* 투자 신호 */}
          {signals.length > 0 && (
            <div>
              {signals.slice(0, 2).map((s, i) => (
                <p key={i} className="text-[11px] text-[#8a8a9a]">
                  · {s}
                </p>
              ))}
            </div>
          )}

          <a
            href={insight.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#ff6b35] hover:underline font-medium"
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getLatestInsights(20).then((data) => {
      setInsights(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div>
        <h2 className="text-xs font-semibold text-[#aaaaaa] tracking-widest mb-4">
          최근 인사이트
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-[#111118] border border-[#2a2a3a] rounded-xl overflow-hidden animate-pulse"
            >
              <div className="w-full bg-[#2a2a3a]" style={{ aspectRatio: "16/9" }} />
              <div className="p-3">
                <div className="h-3 bg-[#2a2a3a] rounded w-1/3 mb-2" />
                <div className="h-4 bg-[#2a2a3a] rounded w-full mb-1" />
                <div className="h-4 bg-[#2a2a3a] rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-semibold text-[#aaaaaa] tracking-widest">
          최근 인사이트
        </h2>
        <span className="text-xs text-[#aaaaaa]">{insights.length}개</span>
      </div>

      {insights.length === 0 ? (
        <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-12 text-center">
          <p className="text-sm text-[#aaaaaa]">수집된 인사이트가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {insights.map((insight) => (
            <InsightCard
              key={insight.video_id}
              insight={insight}
              expanded={expandedId === insight.video_id}
              onToggle={() =>
                setExpandedId(
                  expandedId === insight.video_id ? null : insight.video_id
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
