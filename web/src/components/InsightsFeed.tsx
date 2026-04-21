"use client";

import { useEffect, useState } from "react";
import { getLatestInsights } from "@/lib/api";
import type { YoutubeInsight } from "@/lib/types";

function fmtDate(d: string | null) {
  if (!d) return "";
  if (d.length === 8) return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6)}`;
  return d.slice(0, 10);
}
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const color = sentiment === "긍정" ? "#00b493" : sentiment === "부정" ? "#f04452" : "#f5a623";
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 6, color, background: `${color}18` }}>{sentiment}</span>
  );
}

function InsightCard({ insight, expanded, onToggle }: { insight: YoutubeInsight; expanded: boolean; onToggle: () => void; }) {
  let signals: string[] = [];
  try {
    signals = typeof insight.investment_signals === "string" ? JSON.parse(insight.investment_signals) : insight.investment_signals || [];
  } catch { signals = []; }

  return (
    <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow)" }}>
      <button onClick={onToggle} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "16/9" }}>
          <img src={`https://img.youtube.com/vi/${insight.video_id}/mqdefault.jpg`} alt={insight.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
          <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 6 }}>
            <SentimentBadge sentiment={insight.market_sentiment} />
            {insight.trading_type && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: "rgba(0,0,0,0.65)", color: "#fff", backdropFilter: "blur(4px)" }}>
                {insight.trading_type}
              </span>
            )}
          </div>
          {insight.urgency === "오늘" && (
            <div style={{ position: "absolute", top: 10, right: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: "#f04452", color: "#fff" }}>긴급</span>
            </div>
          )}
        </div>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text-3)" }}>{insight.channel}</span>
            <span style={{ fontSize: 13, color: "var(--text-3)" }}>{insight.processed_at ? timeAgo(insight.processed_at) : fmtDate(insight.upload_date)}</span>
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {insight.title}
          </h3>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, margin: "12px 0" }}>{insight.summary}</p>
          {(insight.key_stocks || []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {insight.key_stocks.map(s => (
                <span key={s} style={{ fontSize: 13, padding: "3px 10px", borderRadius: 6, background: "#e8f3ff", color: "var(--blue)", fontWeight: 600 }}>{s}</span>
              ))}
            </div>
          )}
          {signals.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {signals.slice(0, 2).map((s, i) => (
                <p key={i} style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 3 }}>· {s}</p>
              ))}
            </div>
          )}
          <a href={insight.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 14, color: "var(--blue)", fontWeight: 600, textDecoration: "none" }}>
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
    getLatestInsights(20).then(data => { setInsights(data); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 16, overflow: "hidden" }} className="animate-pulse">
              <div style={{ width: "100%", aspectRatio: "16/9", background: "var(--border)" }} />
              <div style={{ padding: 16 }}>
                <div style={{ height: 12, background: "var(--border)", borderRadius: 6, width: "40%", marginBottom: 10 }} />
                <div style={{ height: 16, background: "var(--border)", borderRadius: 6, width: "100%", marginBottom: 6 }} />
                <div style={{ height: 16, background: "var(--border)", borderRadius: 6, width: "70%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>최근 인사이트</h2>
        <span style={{ fontSize: 13, color: "var(--text-3)" }}>{insights.length}개</span>
      </div>
      {insights.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: "48px", textAlign: "center" }}>
          <p style={{ fontSize: 15, color: "var(--text-3)" }}>수집된 인사이트가 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {insights.map(insight => (
            <InsightCard key={insight.video_id} insight={insight} expanded={expandedId === insight.video_id}
              onToggle={() => setExpandedId(expandedId === insight.video_id ? null : insight.video_id)} />
          ))}
        </div>
      )}
    </div>
  );
}
