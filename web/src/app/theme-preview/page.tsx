"use client";
import { useState } from "react";

const MOCK_SECTORS = [
  { name: "반도체", phase: "상승기", score: 72, trend: [45, 52, 60, 68, 72], note: "2주 연속 상승 — 진입 초기~중기" },
  { name: "2차전지", phase: "진입기", score: 48, trend: [28, 32, 38, 44, 48], note: "바닥권에서 반등 신호 포착" },
  { name: "방산", phase: "과열", score: 84, trend: [70, 75, 80, 82, 84], note: "고점권 유지 — 차익실현 검토" },
  { name: "조선", phase: "침체", score: 22, trend: [35, 30, 28, 24, 22], note: "거래 위축 — 아직 대기" },
];

const MOCK_STOCKS = [
  { name: "삼성전자", change: 1.23, rsi: 58, value: "2.3조" },
  { name: "SK하이닉스", change: 2.41, rsi: 63, value: "1.8조" },
  { name: "한화에어로스페이스", change: -0.85, rsi: 72, value: "9400억" },
  { name: "HD한국조선해양", change: 0.32, rsi: 44, value: "7200억" },
];

// ── Style A: 클린 화이트 ──────────────────────────────────────────────────────

function PhaseTagLight({ phase }: { phase: string }) {
  const cfg: Record<string, { color: string; bg: string }> = {
    상승기: { color: "#1a56db", bg: "#eff6ff" },
    진입기: { color: "#057a55", bg: "#f0fdf4" },
    과열: { color: "#c81e1e", bg: "#fef2f2" },
    침체: { color: "#6b7280", bg: "#f3f4f6" },
    하락기: { color: "#92400e", bg: "#fffbeb" },
  };
  const c = cfg[phase] ?? cfg["침체"];
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: c.color, background: c.bg }}>
      {phase}
    </span>
  );
}

function ThemeA() {
  const [tab, setTab] = useState("rotation");
  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "16px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: 3, color: "#1a56db", fontWeight: 700, marginBottom: 2 }}>KOREA STOCK AI</p>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>주식 AI 대시보드</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ padding: "8px 16px", borderRadius: 8, background: "#eff6ff", color: "#1a56db", border: "1px solid #bfdbfe", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>오늘의 브리핑</button>
            <button style={{ padding: "8px 16px", borderRadius: 8, background: "#1a56db", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>가상투자</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px" }}>
        {/* Fear/Greed card */}
        <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #e5e7eb", padding: "20px 24px", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <p style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>시장 공포탐욕 지수</p>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ fontSize: 52, fontWeight: 900, color: "#f59e0b", lineHeight: 1 }}>62</div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b" }}>탐욕</p>
              <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>유튜브 긍정 우세 · 거래량 1.4x</p>
            </div>
          </div>
          <div style={{ marginTop: 16, height: 8, borderRadius: 99, background: "linear-gradient(to right, #3b82f6, #10b981, #f59e0b, #ef4444)", position: "relative" }}>
            <div style={{ position: "absolute", top: -2, left: "62%", width: 12, height: 12, borderRadius: "50%", background: "#f59e0b", border: "2px solid white", boxShadow: "0 0 0 2px #f59e0b" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#9ca3af" }}>
            <span>극도공포</span><span>공포</span><span>중립</span><span>탐욕</span><span>극도탐욕</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#ffffff", padding: 4, borderRadius: 12, border: "1px solid #e5e7eb" }}>
          {["rotation", "stocks"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: tab === t ? "#1a56db" : "transparent", color: tab === t ? "#ffffff" : "#6b7280" }}>
              {t === "rotation" ? "⚡ 섹터 로테이션" : "🔥 거래량 상위"}
            </button>
          ))}
        </div>

        {/* Sector cards */}
        {tab === "rotation" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {MOCK_SECTORS.map(s => {
              const scoreColor = s.score >= 70 ? "#ef4444" : s.score >= 50 ? "#f59e0b" : s.score >= 35 ? "#3b82f6" : "#9ca3af";
              return (
                <div key={s.name} style={{ background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{s.name}</span>
                      <PhaseTagLight phase={s.phase} />
                    </div>
                    <span style={{ fontSize: 22, fontWeight: 900, color: scoreColor }}>{s.score}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>{s.note}</p>
                  {/* Sparkline dots */}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 32 }}>
                    {s.trend.map((v, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ width: "100%", borderRadius: 3, background: i === 4 ? scoreColor : "#e5e7eb", height: `${(v / 100) * 28}px` }} />
                        <span style={{ fontSize: 9, color: i === 4 ? scoreColor : "#9ca3af", fontWeight: i === 4 ? 700 : 400 }}>{["4주전","3주전","2주전","지난주","이번주"][i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "stocks" && (
          <div style={{ background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
            {MOCK_STOCKS.map((s, i) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: i < MOCK_STOCKS.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "#9ca3af", width: 16 }}>{i + 1}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>RSI {s.rsi}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 13, color: "#6b7280" }}>{s.value}</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: s.change > 0 ? "#ef4444" : "#3b82f6" }}>{s.change > 0 ? "+" : ""}{s.change}%</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Style B: 토스 스타일 ──────────────────────────────────────────────────────

function PhaseTagToss({ phase }: { phase: string }) {
  const cfg: Record<string, { color: string; bg: string }> = {
    상승기: { color: "#3182f6", bg: "#e8f3ff" },
    진입기: { color: "#00b493", bg: "#e5f9f4" },
    과열: { color: "#f04452", bg: "#fff0f1" },
    침체: { color: "#8b95a1", bg: "#f2f4f6" },
    하락기: { color: "#f5a623", bg: "#fff8e6" },
  };
  const c = cfg[phase] ?? cfg["침체"];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, color: c.color, background: c.bg }}>{phase}</span>
  );
}

function ThemeB() {
  const [tab, setTab] = useState("rotation");
  return (
    <div style={{ background: "#f2f4f6", minHeight: "100vh", fontFamily: "'Pretendard', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#ffffff", padding: "18px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#191919", letterSpacing: -0.5 }}>주식 AI</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ padding: "8px 16px", borderRadius: 10, background: "#f2f4f6", color: "#191919", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>브리핑</button>
            <button style={{ padding: "8px 16px", borderRadius: 10, background: "#3182f6", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>가상투자</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
        {/* Fear/Greed */}
        <div style={{ background: "#ffffff", borderRadius: 20, padding: "20px 24px", marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "#8b95a1", fontWeight: 500, marginBottom: 10 }}>시장 공포탐욕 지수</p>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#f5a623", lineHeight: 1 }}>62</div>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: "#f5a623", letterSpacing: -0.5 }}>탐욕</p>
              <p style={{ fontSize: 13, color: "#8b95a1", marginTop: 2 }}>유튜브 긍정 우세 · 거래량 1.4x</p>
            </div>
          </div>
          <div style={{ marginTop: 14, height: 6, borderRadius: 99, background: "linear-gradient(to right, #3182f6, #00b493, #f5a623, #f04452)", position: "relative" }}>
            <div style={{ position: "absolute", top: -3, left: "62%", width: 12, height: 12, borderRadius: "50%", background: "#f5a623", border: "2px solid white" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "#b0b8c1" }}>
            <span>극도공포</span><span>공포</span><span>중립</span><span>탐욕</span><span>극도탐욕</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {["rotation", "stocks"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 20px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: tab === t ? "#3182f6" : "#ffffff", color: tab === t ? "#ffffff" : "#8b95a1", boxShadow: tab === t ? "0 2px 8px rgba(49,130,246,0.25)" : "none" }}>
              {t === "rotation" ? "⚡ 섹터 로테이션" : "🔥 거래량 상위"}
            </button>
          ))}
        </div>

        {tab === "rotation" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {MOCK_SECTORS.map(s => {
              const scoreColor = s.score >= 70 ? "#f04452" : s.score >= 50 ? "#f5a623" : s.score >= 35 ? "#3182f6" : "#b0b8c1";
              return (
                <div key={s.name} style={{ background: "#ffffff", borderRadius: 16, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#191919", letterSpacing: -0.3 }}>{s.name}</span>
                      <PhaseTagToss phase={s.phase} />
                    </div>
                    <span style={{ fontSize: 24, fontWeight: 900, color: scoreColor, letterSpacing: -1 }}>{s.score}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#8b95a1", marginBottom: 12, letterSpacing: -0.2 }}>{s.note}</p>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 36 }}>
                    {s.trend.map((v, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ width: "100%", borderRadius: 4, background: i === 4 ? scoreColor : "#f2f4f6", height: `${(v / 100) * 32}px` }} />
                        <span style={{ fontSize: 9, color: i === 4 ? scoreColor : "#b0b8c1", fontWeight: i === 4 ? 700 : 400 }}>{["4주전","3주전","2주전","지난주","이번주"][i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "stocks" && (
          <div style={{ background: "#ffffff", borderRadius: 16, overflow: "hidden" }}>
            {MOCK_STOCKS.map((s, i) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: i < MOCK_STOCKS.length - 1 ? "1px solid #f2f4f6" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "#b0b8c1", width: 16 }}>{i + 1}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#191919", letterSpacing: -0.3 }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: "#b0b8c1" }}>RSI {s.rsi}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 13, color: "#8b95a1" }}>{s.value}</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: s.change > 0 ? "#f04452" : "#3182f6", letterSpacing: -0.5 }}>{s.change > 0 ? "+" : ""}{s.change}%</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Preview page ──────────────────────────────────────────────────────────────

export default function ThemePreview() {
  const [active, setActive] = useState<"A" | "B">("A");

  return (
    <div>
      {/* Selector */}
      <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", gap: 8, background: "rgba(0,0,0,0.8)", padding: "8px 12px", borderRadius: 99, backdropFilter: "blur(10px)" }}>
        <span style={{ color: "#aaa", fontSize: 12, lineHeight: "32px", marginRight: 4 }}>스타일 선택:</span>
        <button onClick={() => setActive("A")} style={{ padding: "6px 18px", borderRadius: 99, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: active === "A" ? "#1a56db" : "rgba(255,255,255,0.1)", color: active === "A" ? "#fff" : "#aaa" }}>
          A. 클린 화이트
        </button>
        <button onClick={() => setActive("B")} style={{ padding: "6px 18px", borderRadius: 99, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: active === "B" ? "#3182f6" : "rgba(255,255,255,0.1)", color: active === "B" ? "#fff" : "#aaa" }}>
          B. 토스 스타일
        </button>
      </div>

      {active === "A" ? <ThemeA /> : <ThemeB />}
    </div>
  );
}
