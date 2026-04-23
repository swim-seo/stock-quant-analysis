"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SectorFearGreed, RotationPhase, EntryGrade } from "@/lib/market-types";

function scoreColor(n: number) {
  if (n >= 75) return "#f04452";
  if (n >= 58) return "#f5a623";
  if (n >= 42) return "#4e5968";
  if (n >= 25) return "#3182f6";
  return "#1a56db";
}

const PHASE_CFG: Record<RotationPhase, { color: string; bg: string; icon: string }> = {
  진입기: { color: "#00b493", bg: "#e5f9f4", icon: "📡" },
  상승기: { color: "#f5a623", bg: "#fff8e6", icon: "🚀" },
  과열:  { color: "#f04452", bg: "#fff0f1", icon: "🔥" },
  하락기: { color: "#3182f6", bg: "#e8f3ff", icon: "📉" },
  침체:  { color: "#8b95a1", bg: "#f2f4f6", icon: "💤" },
};

const GRADE_CFG: Record<EntryGrade, { color: string; bg: string; icon: string }> = {
  매력적: { color: "#00b493", bg: "#e5f9f4", icon: "🟢" },
  적정:   { color: "#3182f6", bg: "#e8f3ff", icon: "🔵" },
  주의:   { color: "#f5a623", bg: "#fff8e6", icon: "🟡" },
  위험:   { color: "#f04452", bg: "#fff0f1", icon: "🔴" },
};

function formatFlow(n: number) {
  const abs = Math.abs(n);
  const s = n >= 0 ? "+" : "-";
  if (abs >= 100_000_000) return `${s}${(abs / 100_000_000).toFixed(1)}억`;
  if (abs >= 1_000_000) return `${s}${(abs / 1_000_000).toFixed(0)}백만`;
  return `${s}${abs.toLocaleString()}`;
}

function Sparkline({ trend, current }: { trend: number[]; current: number }) {
  const W = 80, H = 30, pad = 4;
  const min = Math.max(0, Math.min(...trend) - 5);
  const max = Math.min(100, Math.max(...trend) + 5);
  const range = max - min || 1;
  const pts = trend.map((v, i) => [
    pad + (i / (trend.length - 1)) * (W - pad * 2),
    H - pad - ((v - min) / range) * (H - pad * 2),
  ] as [number, number]);
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const color = scoreColor(current);
  return (
    <svg width={W} height={H} className="shrink-0">
      <path d={`${path} L${pts[pts.length-1][0]},${H} L${pts[0][0]},${H} Z`} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 4 : 2.5}
          fill={i === pts.length - 1 ? color : "#fff"}
          stroke={color} strokeWidth={1.5} />
      ))}
    </svg>
  );
}

function GaugeBar({ score }: { score: number }) {
  return (
    <div style={{ position: "relative", width: "100%", marginTop: 6 }}>
      <div style={{ height: 6, borderRadius: 99, background: "linear-gradient(to right, #3182f6, #00b493, #f5a623, #f04452)", opacity: 0.4 }} />
      <div style={{ position: "absolute", top: -3, left: `calc(${score}% - 6px)`, width: 12, height: 12, borderRadius: "50%", background: scoreColor(score), border: "2px solid white", boxShadow: `0 0 0 2px ${scoreColor(score)}40` }} />
    </div>
  );
}

function CompRow({ icon, name, score, label, detail }: { icon: string; name: string; score: number; label: string; detail: string }) {
  const color = scoreColor(score * 5);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 14, color: "var(--text-2)" }}>{icon} {name}</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, color, fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{detail}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color, width: 36, textAlign: "right" }}>{score.toFixed(0)}</span>
        </div>
      </div>
      <div style={{ height: 5, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${(score / 20) * 100}%`, height: "100%", background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
}

const PHASE_ORDER: RotationPhase[] = ["진입기", "상승기", "과열", "하락기", "침체"];

export function SectorSignals() {
  const [sectors, setSectors] = useState<SectorFearGreed[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<"rotation" | "score">("rotation");

  useEffect(() => {
    fetch("/api/sector-signals")
      .then(r => r.json())
      .then(d => setSectors(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[...Array(6)].map((_, i) => <div key={i} style={{ height: 90, background: "var(--border)", borderRadius: 16 }} className="animate-pulse" />)}
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>기술지표 + 4주 추이 계산 중...</p>
      </div>
    );
  }

  const grouped = PHASE_ORDER.map(phase => ({ phase, items: sectors.filter(s => s.rotationPhase === phase) })).filter(g => g.items.length > 0);
  const sorted = view === "rotation" ? grouped.flatMap(g => g.items) : [...sectors].sort((a, b) => b.total - a.total);

  return (
    <div>
      {/* View toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#fff", padding: 4, borderRadius: 14, boxShadow: "var(--shadow)" }}>
        {(["rotation", "score"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: view === v ? "var(--blue)" : "transparent", color: view === v ? "#fff" : "var(--text-3)" }}>
            {v === "rotation" ? "🔄 로테이션 단계" : "📊 점수순"}
          </button>
        ))}
      </div>

      {/* Phase legend */}
      {view === "rotation" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {PHASE_ORDER.map(p => {
            const cfg = PHASE_CFG[p];
            const count = sectors.filter(s => s.rotationPhase === p).length;
            if (!count) return null;
            return (
              <span key={p} style={{ fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 20, color: cfg.color, background: cfg.bg }}>
                {cfg.icon} {p} {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Phase group headers */}
      {view === "rotation" ? (
        grouped.map(({ phase, items }) => {
          const cfg = PHASE_CFG[phase];
          return (
            <div key={phase} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: cfg.color }}>{cfg.icon} {phase}</span>
                <div style={{ flex: 1, height: 1, background: `${cfg.color}30` }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(s => <SectorCard key={s.sector} s={s} expanded={expanded} setExpanded={setExpanded} />)}
              </div>
            </div>
          );
        })
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map(s => <SectorCard key={s.sector} s={s} expanded={expanded} setExpanded={setExpanded} />)}
        </div>
      )}
    </div>
  );
}

function SectorCard({ s, expanded, setExpanded }: { s: SectorFearGreed; expanded: string | null; setExpanded: (v: string | null) => void }) {
  const isOpen = expanded === s.sector;
  const cfg = PHASE_CFG[s.rotationPhase];
  const color = scoreColor(s.total);
  const netFlow = s.investorFlow.foreign5d + s.investorFlow.institution5d;
  const trendLabels = ["4주전","3주전","2주전","지난주","이번주"];

  return (
    <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow)" }}>
      <button style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "18px 20px" }}
        onClick={() => setExpanded(isOpen ? null : s.sector)}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: "var(--text-1)", letterSpacing: -0.3 }}>{s.sector}</span>
              <span style={{ fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: cfg.color, background: cfg.bg }}>{cfg.icon} {s.rotationPhase}</span>
              {s.entryGrade && (() => {
                const gc = GRADE_CFG[s.entryGrade];
                return <span style={{ fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: gc.color, background: gc.bg }}>{gc.icon} {s.entryGrade}</span>;
              })()}
            </div>
            <p style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 6, lineHeight: 1.4 }}>{s.rotationNote}</p>
            {s.entryReason && (() => {
              const gc = GRADE_CFG[s.entryGrade];
              return <p style={{ fontSize: 13, color: gc.color, fontWeight: 600, marginBottom: 10 }}>{s.entryReason}</p>;
            })()}
            <GaugeBar score={s.total} />
            <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--text-3)" }}>RSI <b style={{ color: "var(--text-2)" }}>{s.components.rsi.detail.replace("RSI ","")}</b></span>
              <span style={{ fontSize: 13, color: "var(--text-3)" }}>MA <b style={{ color: "var(--text-2)" }}>{s.components.maBreadth.detail.match(/\d+%/)?.[0] ?? ""}</b></span>
              <span style={{ fontSize: 13, color: "var(--text-3)" }}>5일 <b style={{ color: parseFloat(s.components.momentum.detail.split(" ").pop() ?? "0") >= 0 ? "#f04452" : "#3182f6" }}>{s.components.momentum.detail.split(" ").pop()}</b></span>
              <span style={{ fontSize: 13, color: "var(--text-3)" }}>수급 <b style={{ color: netFlow >= 0 ? "#f04452" : "#3182f6" }}>{formatFlow(netFlow)}</b></span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <Sparkline trend={s.weeklyTrend} current={s.total} />
            <span style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: -1 }}>{s.total}</span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{isOpen ? "▲" : "▼"}</span>
          </div>
        </div>
      </button>

      {isOpen && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "20px", background: "var(--bg)", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Weekly trend */}
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>4주 추이</p>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              {s.weeklyTrend.map((score, i) => {
                const c = scoreColor(score);
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: c }}>{score}</span>
                    <div style={{ width: "100%", height: 40, background: "var(--border)", borderRadius: 6, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
                      <div style={{ width: "100%", background: c, opacity: i === 4 ? 1 : 0.4, height: `${score}%`, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, color: i === 4 ? c : "var(--text-3)", fontWeight: i === 4 ? 700 : 400 }}>{trendLabels[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Components */}
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>구성 지표 (각 20점)</p>
            <CompRow icon="📈" name="RSI" score={s.components.rsi.score} label={s.components.rsi.label} detail={s.components.rsi.detail} />
            <CompRow icon="📊" name="MA20 비율" score={s.components.maBreadth.score} label={s.components.maBreadth.label} detail={s.components.maBreadth.detail} />
            <CompRow icon="🚀" name="5일 모멘텀" score={s.components.momentum.score} label={s.components.momentum.label} detail={s.components.momentum.detail} />
            <CompRow icon="🔥" name="거래량" score={s.components.volume.score} label={s.components.volume.label} detail={s.components.volume.detail} />
            <CompRow icon="📺" name="유튜브 심리" score={s.components.youtube.score} label={s.components.youtube.label} detail={s.components.youtube.detail} />
          </div>

          {/* Investor flow */}
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>외국인/기관 수급 (5일)</p>
            <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
              <span style={{ color: "var(--text-2)" }}>외국인 <b style={{ color: s.investorFlow.foreign5d >= 0 ? "#f04452" : "#3182f6" }}>{formatFlow(s.investorFlow.foreign5d)}</b></span>
              <span style={{ color: "var(--text-2)" }}>기관 <b style={{ color: s.investorFlow.institution5d >= 0 ? "#f04452" : "#3182f6" }}>{formatFlow(s.investorFlow.institution5d)}</b></span>
            </div>
          </div>

          {/* Fundamentals */}
          {s.fundamental && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>펀더멘털</p>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 14 }}>
                <span style={{ color: "var(--text-2)" }}>
                  PER <b style={{ color: "var(--text-1)" }}>{s.fundamental.avgPER != null ? s.fundamental.avgPER : "—"}</b>
                  {s.fundamental.avgPER != null && <span style={{ fontSize: 12, color: s.fundamental.valuationLabel === "저평가" ? "#00b493" : s.fundamental.valuationLabel.includes("고평가") ? "#f04452" : "var(--text-3)", marginLeft: 4 }}>({s.fundamental.valuationLabel})</span>}
                </span>
                <span style={{ color: "var(--text-2)" }}>
                  PBR <b style={{ color: "var(--text-1)" }}>{s.fundamental.avgPBR != null ? s.fundamental.avgPBR : "—"}</b>
                </span>
                <span style={{ color: "var(--text-2)" }}>
                  애널리스트 <b style={{ color: s.fundamental.avgAnalystRating != null && s.fundamental.avgAnalystRating <= 2 ? "#00b493" : s.fundamental.avgAnalystRating != null && s.fundamental.avgAnalystRating >= 3.5 ? "#f04452" : "var(--text-1)" }}>{s.fundamental.analystLabel}</b>
                  {s.fundamental.avgAnalystRating != null && <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 4 }}>({s.fundamental.avgAnalystRating.toFixed(1)})</span>}
                </span>
              </div>
            </div>
          )}

          {/* Top stocks */}
          {s.topStocks.length > 0 && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>주요 종목</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {s.topStocks.map(st => (
                  <Link key={st.ticker} href={`/stock?ticker=${st.ticker}`}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff", textDecoration: "none", minWidth: 64 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{st.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: st.changePct > 0 ? "#f04452" : "#3182f6" }}>{st.changePct > 0 ? "+" : ""}{st.changePct}%</span>
                    <span style={{ fontSize: 12, color: st.rsi >= 70 ? "#f04452" : st.rsi <= 30 ? "#3182f6" : "var(--text-3)" }}>RSI {st.rsi?.toFixed(0)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
