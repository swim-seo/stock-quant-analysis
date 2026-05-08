"use client";

import { useEffect, useState } from "react";

interface Component { score: number; label: string; detail: string; }
interface FearGreedData {
  score: number; label: string;
  components: { volatility: Component; momentum: Component; volume: Component; usFearGreed: Component; youtube: Component; };
}

const COMP_LABELS: Record<string, string> = {
  volatility: "코스피 변동성", momentum: "코스피 모멘텀",
  volume: "거래량 모멘텀", usFearGreed: "미국 F&G", youtube: "유튜브 심리",
};

function scoreColor(n: number) {
  if (n >= 80) return "#f04452";
  if (n >= 60) return "#f5a623";
  if (n >= 40) return "#4e5968";
  if (n >= 20) return "#3182f6";
  return "#1a56db";
}

function compColor(s: number) {
  return scoreColor(s * 5);
}

export function SentimentCard() {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/fear-greed").then(r => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div style={{ background: "var(--card)", borderRadius: 20, padding: "16px 24px", boxShadow: "var(--shadow)" }} className="animate-pulse">
        <div style={{ height: 14, background: "var(--border)", borderRadius: 8, width: "60%" }} />
      </div>
    );
  }

  const color = scoreColor(data.score);

  return (
    <div style={{ background: "var(--card)", borderRadius: 20, boxShadow: "var(--shadow)", overflow: "hidden" }}>
      {/* 항상 표시: 한 줄 요약 + 토글 */}
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "14px 20px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)", flexShrink: 0 }}>공포탐욕 지수</span>
        <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: `${data.score}%`, height: "100%", background: "linear-gradient(90deg, #3182f6, #00b493, #f5a623, #f04452)", borderRadius: 99 }} />
        </div>
        <span style={{ fontSize: 18, fontWeight: 900, color, flexShrink: 0 }}>{data.score.toFixed(0)}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color, flexShrink: 0, minWidth: 60 }}>{data.label}</span>
        <span style={{ fontSize: 12, color: "var(--text-3)", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* 펼치면 상세 */}
      {open && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)", marginBottom: 16 }}>
            <span>극도공포</span><span>공포</span><span>중립</span><span>탐욕</span><span>극도탐욕</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Object.entries(data.components).map(([key, comp]) => {
              const c = compColor(comp.score);
              return (
                <div key={key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500 }}>{COMP_LABELS[key]}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: c }}>{comp.score.toFixed(0)}/20</span>
                  </div>
                  <div style={{ height: 5, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginBottom: 3 }}>
                    <div style={{ width: `${(comp.score / 20) * 100}%`, height: "100%", background: c, borderRadius: 99 }} />
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-3)" }}>{comp.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
