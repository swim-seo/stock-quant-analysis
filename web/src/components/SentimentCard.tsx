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

  useEffect(() => {
    fetch("/api/fear-greed").then(r => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div style={{ background: "var(--card)", borderRadius: 20, padding: "24px", boxShadow: "var(--shadow)" }} className="animate-pulse">
        <div style={{ height: 16, background: "var(--border)", borderRadius: 8, width: "40%", marginBottom: 20 }} />
        <div style={{ height: 56, background: "var(--border)", borderRadius: 8, width: "50%", margin: "0 auto 20px" }} />
        {[...Array(5)].map((_, i) => <div key={i} style={{ height: 32, background: "var(--border)", borderRadius: 8, marginBottom: 10 }} />)}
      </div>
    );
  }

  const color = scoreColor(data.score);

  return (
    <div style={{ background: "var(--card)", borderRadius: 20, padding: "24px", boxShadow: "var(--shadow)" }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 16 }}>공포탐욕 지수</p>

      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 56, fontWeight: 900, color, lineHeight: 1, letterSpacing: -2 }}>{data.score.toFixed(0)}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 6 }}>{data.label}</div>
      </div>

      <div style={{ height: 8, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ width: `${data.score}%`, height: "100%", background: "linear-gradient(90deg, #3182f6, #00b493, #f5a623, #f04452)", borderRadius: 99 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-3)", marginBottom: 20 }}>
        <span>극도공포</span><span>공포</span><span>중립</span><span>탐욕</span><span>극도탐욕</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {Object.entries(data.components).map(([key, comp]) => {
          const c = compColor(comp.score);
          return (
            <div key={key}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 14, color: "var(--text-2)", fontWeight: 500 }}>{COMP_LABELS[key]}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: c }}>{comp.score.toFixed(0)}/20</span>
              </div>
              <div style={{ height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ width: `${(comp.score / 20) * 100}%`, height: "100%", background: c, borderRadius: 99 }} />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>{comp.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
