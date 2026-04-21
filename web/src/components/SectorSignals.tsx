"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SectorFearGreed, RotationPhase } from "@/lib/market-types";

// ── Palette ───────────────────────────────────────────────────────────────────

function scoreColor(n: number) {
  if (n >= 75) return "#ff4d4d";
  if (n >= 58) return "#ff9944";
  if (n >= 42) return "#ffd700";
  if (n >= 25) return "#66aaff";
  return "#4488ff";
}

const PHASE_CFG: Record<RotationPhase, { color: string; bg: string; icon: string }> = {
  진입기:  { color: "#00ff88", bg: "#00ff8818", icon: "📡" },
  상승기:  { color: "#ff9944", bg: "#ff994418", icon: "🚀" },
  과열:   { color: "#ff4d4d", bg: "#ff4d4d18", icon: "🔥" },
  하락기:  { color: "#66aaff", bg: "#66aaff18", icon: "📉" },
  침체:   { color: "#555",    bg: "#55555518", icon: "💤" },
};

function formatFlow(n: number) {
  const abs = Math.abs(n);
  const s = n >= 0 ? "+" : "-";
  if (abs >= 100_000_000) return `${s}${(abs / 100_000_000).toFixed(1)}억`;
  if (abs >= 1_000_000)   return `${s}${(abs / 1_000_000).toFixed(0)}백만`;
  return `${s}${abs.toLocaleString()}`;
}

// ── Sparkline (5 weekly dots) ─────────────────────────────────────────────────

function Sparkline({ trend, current }: { trend: number[]; current: number }) {
  const W = 80, H = 28, pad = 4;
  const min = Math.max(0, Math.min(...trend) - 5);
  const max = Math.min(100, Math.max(...trend) + 5);
  const range = max - min || 1;

  const pts = trend.map((v, i) => {
    const x = pad + (i / (trend.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return [x, y] as [number, number];
  });

  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const color = scoreColor(current);

  return (
    <svg width={W} height={H} className="shrink-0">
      {/* area fill */}
      <defs>
        <linearGradient id={`sg-${current}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`}
        fill={`url(#sg-${current})`}
      />
      {/* line */}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {/* dots */}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 3 : 2}
          fill={i === pts.length - 1 ? color : "#2a2a3a"}
          stroke={color} strokeWidth={i === pts.length - 1 ? 1.5 : 1} />
      ))}
    </svg>
  );
}

// ── Gauge bar ─────────────────────────────────────────────────────────────────

function GaugeBar({ score }: { score: number }) {
  return (
    <div className="relative w-full mt-1">
      <div className="h-1.5 rounded-full w-full" style={{
        background: "linear-gradient(to right, #4488ff, #66aaff 25%, #ffd700 50%, #ff9944 75%, #ff4d4d)",
      }} />
      <div className="absolute -top-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a12]"
        style={{ left: `calc(${score}% - 6px)`, background: scoreColor(score), boxShadow: `0 0 5px ${scoreColor(score)}` }}
      />
    </div>
  );
}

// ── Component row ─────────────────────────────────────────────────────────────

function CompRow({ icon, name, score, label, detail }: { icon: string; name: string; score: number; label: string; detail: string }) {
  const color = scoreColor(score * 5);
  return (
    <div className="mb-2">
      <div className="flex justify-between mb-0.5">
        <span className="text-[11px] text-[#aaa]">{icon} {name}</span>
        <div className="flex gap-2">
          <span className="text-[10px]" style={{ color }}>{label}</span>
          <span className="text-[10px] text-[#555]">{detail}</span>
          <span className="text-[11px] font-bold w-8 text-right" style={{ color }}>{score.toFixed(0)}</span>
        </div>
      </div>
      <div className="h-1 bg-[#1a1a2a] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${(score / 20) * 100}%`, background: color, opacity: 0.7 }} />
      </div>
    </div>
  );
}

// ── Rotation phase grouping ────────────────────────────────────────────────────

const PHASE_ORDER: RotationPhase[] = ["진입기", "상승기", "과열", "하락기", "침체"];

// ── Main ──────────────────────────────────────────────────────────────────────

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
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-[#1a1a2a] rounded-xl animate-pulse" />)}
        <p className="text-center text-[11px] text-[#555] pt-1">기술지표 + 4주 추이 계산 중...</p>
      </div>
    );
  }

  const grouped = PHASE_ORDER.map(phase => ({
    phase,
    items: sectors.filter(s => s.rotationPhase === phase),
  })).filter(g => g.items.length > 0);

  const sorted = view === "rotation"
    ? grouped.flatMap(g => g.items)
    : [...sectors].sort((a, b) => b.total - a.total);

  return (
    <div>
      {/* View toggle */}
      <div className="flex gap-1 mb-3 bg-[#111118] p-1 rounded-lg border border-[#2a2a3a]">
        {(["rotation", "score"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className="flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-colors"
            style={{ background: view === v ? "#2a2a3a" : "transparent", color: view === v ? "#fff" : "#555" }}
          >
            {v === "rotation" ? "🔄 로테이션 단계" : "📊 점수순"}
          </button>
        ))}
      </div>

      {/* Phase legend (rotation view) */}
      {view === "rotation" && (
        <div className="flex flex-wrap gap-2 mb-3 px-1">
          {PHASE_ORDER.map(p => {
            const cfg = PHASE_CFG[p];
            const count = sectors.filter(s => s.rotationPhase === p).length;
            if (!count) return null;
            return (
              <span key={p} className="text-[10px] px-2 py-0.5 rounded-full border"
                style={{ color: cfg.color, borderColor: cfg.color + "40", background: cfg.bg }}>
                {cfg.icon} {p} {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Phase group headers (rotation view) */}
      {view === "rotation" ? (
        grouped.map(({ phase, items }) => {
          const cfg = PHASE_CFG[phase];
          return (
            <div key={phase} className="mb-4">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[11px] font-bold" style={{ color: cfg.color }}>{cfg.icon} {phase}</span>
                <div className="flex-1 h-px" style={{ background: cfg.color + "30" }} />
              </div>
              <div className="space-y-2">
                {items.map(s => <SectorCard key={s.sector} s={s} expanded={expanded} setExpanded={setExpanded} />)}
              </div>
            </div>
          );
        })
      ) : (
        <div className="space-y-2">
          {sorted.map(s => <SectorCard key={s.sector} s={s} expanded={expanded} setExpanded={setExpanded} />)}
        </div>
      )}
    </div>
  );
}

// ── Sector card ───────────────────────────────────────────────────────────────

function SectorCard({ s, expanded, setExpanded }: {
  s: SectorFearGreed;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
}) {
  const isOpen = expanded === s.sector;
  const cfg = PHASE_CFG[s.rotationPhase];
  const netFlow = s.investorFlow.foreign5d + s.investorFlow.institution5d;
  const color = scoreColor(s.total);

  const trendLabels = ["4주전", "3주전", "2주전", "지난주", "이번주"];

  return (
    <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl overflow-hidden">
      <button className="w-full text-left px-4 pt-3 pb-2.5" onClick={() => setExpanded(isOpen ? null : s.sector)}>
        <div className="flex items-center justify-between">
          {/* Left */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-white">{s.sector}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                style={{ color: cfg.color, borderColor: cfg.color + "40", background: cfg.bg }}>
                {cfg.icon} {s.rotationPhase}
              </span>
            </div>
            <p className="text-[10px] text-[#8a8a9a] leading-tight truncate pr-4">{s.rotationNote}</p>
            {/* gauge */}
            <GaugeBar score={s.total} />
          </div>
          {/* Right: sparkline + score */}
          <div className="flex flex-col items-end gap-1 ml-3">
            <Sparkline trend={s.weeklyTrend} current={s.total} />
            <span className="text-base font-black" style={{ color }}>{s.total}</span>
          </div>
        </div>

        {/* Quick chips */}
        <div className="flex gap-2 mt-2 flex-wrap">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a2a] text-[#aaa]">
            RSI {s.components.rsi.detail.replace("RSI ", "")}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a2a] text-[#aaa]">
            MA {s.components.maBreadth.detail.match(/\d+%/)?.[0] ?? ""}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a2a]"
            style={{ color: parseFloat(s.components.momentum.detail.split(/[\s+]/)[s.components.momentum.detail.includes("+") ? 3 : 2]) >= 0 ? "#ff4444" : "#4488ff" }}>
            {s.components.momentum.detail.split(" ").slice(-1)[0]}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a2a]"
            style={{ color: netFlow >= 0 ? "#ff4444" : "#4488ff" }}>
            수급 {formatFlow(netFlow)}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-[#2a2a3a] px-4 py-3 bg-[#0d0d18] space-y-4">
          {/* Weekly trend detail */}
          <div>
            <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-2">4주 추이</p>
            <div className="flex justify-between">
              {s.weeklyTrend.map((score, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-[11px] font-black" style={{ color: scoreColor(score) }}>{score}</span>
                  <div className="h-8 w-5 bg-[#1a1a2a] rounded-sm overflow-hidden flex flex-col justify-end">
                    <div className="w-full rounded-sm" style={{ height: `${score}%`, background: scoreColor(score), opacity: 0.7 }} />
                  </div>
                  <span className="text-[9px] text-[#555]">{trendLabels[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 5 components */}
          <div>
            <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-2">구성 지표 (각 20점)</p>
            <CompRow icon="📈" name="RSI" score={s.components.rsi.score} label={s.components.rsi.label} detail={s.components.rsi.detail} />
            <CompRow icon="📊" name="MA20 비율" score={s.components.maBreadth.score} label={s.components.maBreadth.label} detail={s.components.maBreadth.detail} />
            <CompRow icon="🚀" name="5일 모멘텀" score={s.components.momentum.score} label={s.components.momentum.label} detail={s.components.momentum.detail} />
            <CompRow icon="🔥" name="거래량" score={s.components.volume.score} label={s.components.volume.label} detail={s.components.volume.detail} />
            <CompRow icon="📺" name="유튜브 심리" score={s.components.youtube.score} label={s.components.youtube.label} detail={s.components.youtube.detail} />
          </div>

          {/* Investor flow */}
          <div>
            <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-1.5">외국인/기관 수급 (5일 누적)</p>
            <div className="flex gap-4 text-[11px]">
              <span className="text-[#aaa]">외국인 <span style={{ color: s.investorFlow.foreign5d >= 0 ? "#ff4444" : "#4488ff", fontWeight: "bold" }}>{formatFlow(s.investorFlow.foreign5d)}</span></span>
              <span className="text-[#aaa]">기관 <span style={{ color: s.investorFlow.institution5d >= 0 ? "#ff4444" : "#4488ff", fontWeight: "bold" }}>{formatFlow(s.investorFlow.institution5d)}</span></span>
            </div>
          </div>

          {/* Top stocks */}
          {s.topStocks.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-1.5">주요 종목</p>
              <div className="flex flex-wrap gap-2">
                {s.topStocks.map(st => (
                  <Link key={st.ticker} href={`/stock?ticker=${st.ticker}`}
                    className="flex flex-col items-center px-2.5 py-1.5 rounded-lg border border-[#2a2a3a] hover:border-[#ffd70040] hover:bg-[#1a1a2a] transition-colors min-w-[58px]">
                    <span className="text-[10px] font-semibold text-white leading-tight">{st.name}</span>
                    <span className="text-[10px] font-bold" style={{ color: st.changePct > 0 ? "#ff4444" : st.changePct < 0 ? "#4488ff" : "#888" }}>
                      {st.changePct > 0 ? "+" : ""}{st.changePct}%
                    </span>
                    <span className="text-[9px]" style={{ color: st.rsi >= 70 ? "#ff4444" : st.rsi <= 30 ? "#4488ff" : "#888" }}>
                      RSI {st.rsi?.toFixed(0)}
                    </span>
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
