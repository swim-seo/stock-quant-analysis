"use client";

import { useEffect, useState } from "react";

interface Component { score: number; label: string; detail: string; }
interface SectorItem { name: string; score: number; label: "긍정" | "중립" | "부정"; 긍정: number; 중립: number; 부정: number; total: number; }
interface FearGreedData {
  score: number; label: string;
  components: { volatility: Component; momentum: Component; volume: Component; usFearGreed: Component; youtube: Component; };
  sectors: SectorItem[];
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
  const [tab, setTab] = useState<"feargreed" | "sector">("feargreed");

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
      {/* Tab buttons */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--bg)", padding: 4, borderRadius: 12 }}>
        {(["feargreed", "sector"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: tab === t ? "var(--blue)" : "transparent", color: tab === t ? "#fff" : "var(--text-3)" }}>
            {t === "feargreed" ? "공포탐욕 지수" : "섹터별 심리"}
          </button>
        ))}
      </div>

      {tab === "feargreed" ? (
        <>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 56, fontWeight: 900, color, lineHeight: 1, letterSpacing: -2 }}>{data.score.toFixed(0)}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 6 }}>{data.label}</div>
          </div>

          <div style={{ height: 8, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginBottom: 8, position: "relative" }}>
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
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16 }}>최근 유튜브 영상 기준 · 3회 이상 언급 섹터</p>
          {data.sectors.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-3)", fontSize: 14, padding: "24px 0" }}>섹터 데이터 없음</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.sectors.map(s => {
                const sColor = s.label === "긍정" ? "#00b493" : s.label === "부정" ? "#f04452" : "#f5a623";
                const posW = s.total > 0 ? (s.긍정 / s.total) * 100 : 0;
                const neuW = s.total > 0 ? (s.중립 / s.total) * 100 : 0;
                const negW = s.total > 0 ? (s.부정 / s.total) * 100 : 0;
                return (
                  <div key={s.name} style={{ background: "var(--bg)", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{s.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: sColor, background: `${sColor}18` }}>{s.label}</span>
                        <span style={{ fontSize: 13, color: "var(--text-3)" }}>영상 {s.total}개</span>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, overflow: "hidden", display: "flex", marginBottom: 8 }}>
                      {posW > 0 && <div style={{ width: `${posW}%`, background: "#00b493" }} />}
                      {neuW > 0 && <div style={{ width: `${neuW}%`, background: "#f5a623" }} />}
                      {negW > 0 && <div style={{ width: `${negW}%`, background: "#f04452" }} />}
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-2)" }}>
                      <span>긍정 <b style={{ color: "#00b493" }}>{s.긍정}개</b></span>
                      <span>중립 <b style={{ color: "#f5a623" }}>{s.중립}개</b></span>
                      <span>부정 <b style={{ color: "#f04452" }}>{s.부정}개</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
