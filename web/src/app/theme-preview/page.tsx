"use client";
import { useState, useEffect } from "react";

interface SectorData {
  sector_code:   string;
  name:          string;
  phase:         string;
  score:         number;
  change_pct:    number;
  current_index: number;
  trend:         number[];
  updated_at:    string;
}

interface MarketStock {
  ticker:                  string;
  stock_name:              string;
  foreign_net_amount:      number;
  institution_net_amount:  number;
  change_pct:              number;
  volume:                  number;
}

// ── 데이터 fetch ──────────────────────────────────────────────────────────────
async function fetchSectorData(): Promise<SectorData[]> {
  try {
    const res = await fetch("/api/sector-rotation", { next: { revalidate: 300 } });
    const data = await res.json();
    return data.sectors || [];
  } catch {
    return [];
  }
}

async function fetchMarketInvestorRanking(): Promise<MarketStock[]> {
  try {
    const res = await fetch("/api/hot-stocks", { next: { revalidate: 300 } });
    const data = await res.json();
    return (data.stocks || data || []).slice(0, 10);
  } catch {
    return [];
  }
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function fmtAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}조`;
  if (abs >= 100_000_000)       return `${(n / 100_000_000).toFixed(0)}억`;
  if (abs >= 10_000)            return `${(n / 10_000).toFixed(0)}만`;
  return String(n);
}

// ── 스타일 공통 ───────────────────────────────────────────────────────────────
const PHASE_CFG: Record<string, { color: string; bg: string }> = {
  상승기: { color: "#1a56db", bg: "#eff6ff" },
  진입기: { color: "#057a55", bg: "#f0fdf4" },
  과열:   { color: "#c81e1e", bg: "#fef2f2" },
  하락기: { color: "#92400e", bg: "#fffbeb" },
  침체:   { color: "#6b7280", bg: "#f3f4f6" },
};

function PhaseTag({ phase, toss = false }: { phase: string; toss?: boolean }) {
  const cfg = PHASE_CFG[phase] ?? PHASE_CFG["침체"];
  return (
    <span
      style={{
        fontSize: toss ? 11 : 12,
        fontWeight: 600,
        padding: toss ? "2px 8px" : "2px 8px",
        borderRadius: toss ? 6 : 99,
        color: cfg.color,
        background: cfg.bg,
      }}
    >
      {phase}
    </span>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null;
  const max = Math.max(...values);
  const labels = ["4주전", "3주전", "2주전", "지난주", "이번주"];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 36 }}>
      {values.slice(-5).map((v, i, arr) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div
            style={{
              width: "100%", borderRadius: 3,
              background: i === arr.length - 1 ? color : "#e5e7eb",
              height: `${Math.max((v / (max || 1)) * 32, 4)}px`,
            }}
          />
          <span style={{ fontSize: 9, color: i === arr.length - 1 ? color : "#9ca3af", fontWeight: i === arr.length - 1 ? 700 : 400 }}>
            {labels[i + (5 - arr.length)]}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Style A: 클린 화이트 ──────────────────────────────────────────────────────
function ThemeA({ sectors, stocks, loading }: { sectors: SectorData[]; stocks: MarketStock[]; loading: boolean }) {
  const [tab, setTab] = useState("rotation");
  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "16px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: 3, color: "#1a56db", fontWeight: 700, marginBottom: 2 }}>KOREA STOCK AI</p>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>주식 AI 대시보드</h1>
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            {sectors[0]?.updated_at ? `업데이트: ${new Date(sectors[0].updated_at).toLocaleString("ko-KR")}` : ""}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#fff", padding: 4, borderRadius: 12, border: "1px solid #e5e7eb" }}>
          {["rotation", "stocks"].map((t) => (
            <button
              key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: tab === t ? "#1a56db" : "transparent", color: tab === t ? "#fff" : "#6b7280" }}
            >
              {t === "rotation" ? "⚡ 섹터 로테이션" : "🔥 수급 상위"}
            </button>
          ))}
        </div>

        {loading && <p style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>데이터 로딩 중...</p>}

        {!loading && tab === "rotation" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sectors.map((s) => {
              const scoreColor = s.score >= 70 ? "#ef4444" : s.score >= 50 ? "#f59e0b" : s.score >= 35 ? "#3b82f6" : "#9ca3af";
              return (
                <div key={s.sector_code} style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{s.name}</span>
                      <PhaseTag phase={s.phase} />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 22, fontWeight: 900, color: scoreColor }}>{s.score}</span>
                      <span style={{ fontSize: 12, color: s.change_pct >= 0 ? "#ef4444" : "#3b82f6", marginLeft: 8 }}>
                        {s.change_pct >= 0 ? "+" : ""}{s.change_pct?.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <Sparkline values={s.trend} color={scoreColor} />
                </div>
              );
            })}
            {sectors.length === 0 && <p style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>섹터 데이터가 없습니다. Railway 크론 실행 후 데이터가 생성됩니다.</p>}
          </div>
        )}

        {!loading && tab === "stocks" && (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
            {stocks.map((s, i) => (
              <div key={s.ticker} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: i < stocks.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "#9ca3af", width: 16 }}>{i + 1}</span>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{s.stock_name}</p>
                    <p style={{ fontSize: 11, color: "#9ca3af" }}>
                      외국인 {fmtAmount(s.foreign_net_amount)} · 기관 {fmtAmount(s.institution_net_amount)}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: s.change_pct > 0 ? "#ef4444" : "#3b82f6" }}>
                    {s.change_pct > 0 ? "+" : ""}{s.change_pct?.toFixed(2)}%
                  </p>
                </div>
              </div>
            ))}
            {stocks.length === 0 && <p style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>수급 데이터 없음</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Style B: 토스 스타일 ──────────────────────────────────────────────────────
function ThemeB({ sectors, stocks, loading }: { sectors: SectorData[]; stocks: MarketStock[]; loading: boolean }) {
  const [tab, setTab] = useState("rotation");
  return (
    <div style={{ background: "#f2f4f6", minHeight: "100vh", fontFamily: "'Pretendard', system-ui, sans-serif" }}>
      <div style={{ background: "#fff", padding: "18px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#191919", letterSpacing: -0.5 }}>주식 AI</h1>
          <span style={{ fontSize: 11, color: "#b0b8c1" }}>
            {sectors[0]?.updated_at ? new Date(sectors[0].updated_at).toLocaleString("ko-KR") : ""}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {["rotation", "stocks"].map((t) => (
            <button
              key={t} onClick={() => setTab(t)}
              style={{ padding: "10px 20px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
                background: tab === t ? "#3182f6" : "#fff", color: tab === t ? "#fff" : "#8b95a1",
                boxShadow: tab === t ? "0 2px 8px rgba(49,130,246,0.25)" : "none" }}
            >
              {t === "rotation" ? "⚡ 섹터 로테이션" : "🔥 수급 상위"}
            </button>
          ))}
        </div>

        {loading && <p style={{ textAlign: "center", color: "#b0b8c1", padding: 40 }}>데이터 로딩 중...</p>}

        {!loading && tab === "rotation" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sectors.map((s) => {
              const scoreColor = s.score >= 70 ? "#f04452" : s.score >= 50 ? "#f5a623" : s.score >= 35 ? "#3182f6" : "#b0b8c1";
              return (
                <div key={s.sector_code} style={{ background: "#fff", borderRadius: 16, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#191919", letterSpacing: -0.3 }}>{s.name}</span>
                      <PhaseTag phase={s.phase} toss />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 24, fontWeight: 900, color: scoreColor, letterSpacing: -1 }}>{s.score}</span>
                      <span style={{ fontSize: 12, color: s.change_pct >= 0 ? "#f04452" : "#3182f6", marginLeft: 8 }}>
                        {s.change_pct >= 0 ? "+" : ""}{s.change_pct?.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <Sparkline values={s.trend} color={scoreColor} />
                </div>
              );
            })}
            {sectors.length === 0 && <p style={{ color: "#b0b8c1", textAlign: "center", padding: 40 }}>Railway 크론 실행 후 데이터가 생성됩니다.</p>}
          </div>
        )}

        {!loading && tab === "stocks" && (
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden" }}>
            {stocks.map((s, i) => (
              <div key={s.ticker} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: i < stocks.length - 1 ? "1px solid #f2f4f6" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "#b0b8c1", width: 16 }}>{i + 1}</span>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "#191919", letterSpacing: -0.3 }}>{s.stock_name}</p>
                    <p style={{ fontSize: 12, color: "#8b95a1" }}>
                      외국인 {fmtAmount(s.foreign_net_amount)} · 기관 {fmtAmount(s.institution_net_amount)}
                    </p>
                  </div>
                </div>
                <p style={{ fontSize: 15, fontWeight: 800, color: s.change_pct > 0 ? "#f04452" : "#3182f6", letterSpacing: -0.5 }}>
                  {s.change_pct > 0 ? "+" : ""}{s.change_pct?.toFixed(2)}%
                </p>
              </div>
            ))}
            {stocks.length === 0 && <p style={{ color: "#b0b8c1", textAlign: "center", padding: 40 }}>수급 데이터 없음</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Preview page ──────────────────────────────────────────────────────────────
export default function ThemePreview() {
  const [active, setActive]   = useState<"A" | "B">("A");
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [stocks, setStocks]   = useState<MarketStock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchSectorData(), fetchMarketInvestorRanking()])
      .then(([s, st]) => { setSectors(s); setStocks(st); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", gap: 8, background: "rgba(0,0,0,0.8)", padding: "8px 12px", borderRadius: 99, backdropFilter: "blur(10px)" }}>
        <span style={{ color: "#aaa", fontSize: 12, lineHeight: "32px", marginRight: 4 }}>스타일:</span>
        {(["A", "B"] as const).map((k) => (
          <button key={k} onClick={() => setActive(k)}
            style={{ padding: "6px 18px", borderRadius: 99, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
              background: active === k ? "#1a56db" : "rgba(255,255,255,0.1)", color: active === k ? "#fff" : "#aaa" }}>
            {k === "A" ? "클린 화이트" : "토스 스타일"}
          </button>
        ))}
      </div>

      {active === "A"
        ? <ThemeA sectors={sectors} stocks={stocks} loading={loading} />
        : <ThemeB sectors={sectors} stocks={stocks} loading={loading} />}
    </div>
  );
}
