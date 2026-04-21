"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SectorFearGreed } from "@/app/api/sector-signals/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#ff4d4d";
  if (score >= 60) return "#ff9944";
  if (score >= 40) return "#ffd700";
  if (score >= 20) return "#66aaff";
  return "#4488ff";
}

function labelColor(label: string): string {
  const map: Record<string, string> = {
    "극도의 탐욕": "#ff4d4d",
    "탐욕": "#ff9944",
    "중립": "#ffd700",
    "공포": "#66aaff",
    "극도의 공포": "#4488ff",
  };
  return map[label] ?? "#888";
}

function formatFlow(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}억`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(0)}백만`;
  return `${sign}${abs.toLocaleString()}`;
}

// ── Gauge bar (horizontal gradient with pointer) ───────────────────────────────

function GaugeBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="relative w-full">
      {/* gradient track */}
      <div
        className="h-2 rounded-full w-full"
        style={{
          background: "linear-gradient(to right, #4488ff, #66aaff 25%, #ffd700 50%, #ff9944 75%, #ff4d4d)",
        }}
      />
      {/* pointer */}
      <div
        className="absolute -top-0.5 w-3 h-3 rounded-full border-2 border-white shadow-md"
        style={{
          left: `calc(${pct}% - 6px)`,
          background: scoreColor(score),
          boxShadow: `0 0 6px ${scoreColor(score)}`,
        }}
      />
    </div>
  );
}

// ── Component bar ─────────────────────────────────────────────────────────────

function CompRow({
  icon, name, score, label, detail,
}: {
  icon: string; name: string; score: number; label: string; detail: string;
}) {
  const pct = (score / 20) * 100;
  const color = scoreColor(score * 5); // scale 0-20 to 0-100
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]">{icon}</span>
          <span className="text-[11px] text-[#aaa]">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color }}>{label}</span>
          <span className="text-[10px] text-[#555]">{detail}</span>
          <span className="text-[11px] font-bold w-8 text-right" style={{ color }}>
            {score.toFixed(0)}/20
          </span>
        </div>
      </div>
      <div className="h-1 bg-[#1a1a2a] rounded-full overflow-hidden mb-2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, opacity: 0.7 }} />
      </div>
    </div>
  );
}

// ── Stock chip ────────────────────────────────────────────────────────────────

function StockChip({ name, ticker, changePct, rsi }: { name: string; ticker: string; changePct: number; rsi: number }) {
  const changeColor = changePct > 0 ? "#ff4444" : changePct < 0 ? "#4488ff" : "#888";
  const rsiColor = rsi >= 70 ? "#ff4444" : rsi <= 30 ? "#4488ff" : "#888";
  return (
    <Link
      href={`/stock?ticker=${ticker}`}
      className="flex flex-col items-center px-2.5 py-1.5 rounded-lg border border-[#2a2a3a] hover:border-[#ffd70040] hover:bg-[#1a1a2a] transition-colors min-w-[60px]"
    >
      <span className="text-[10px] font-semibold text-white leading-tight">{name}</span>
      <span className="text-[10px] font-bold" style={{ color: changeColor }}>
        {changePct > 0 ? "+" : ""}{changePct}%
      </span>
      <span className="text-[9px]" style={{ color: rsiColor }}>RSI {rsi.toFixed(0)}</span>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SectorSignals() {
  const [sectors, setSectors] = useState<SectorFearGreed[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sector-signals")
      .then(r => r.json())
      .then(d => setSectors(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-20 bg-[#1a1a2a] rounded-xl animate-pulse" />
        ))}
        <p className="text-center text-[11px] text-[#555] pt-1">기술지표 계산 중... (30초 소요)</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex justify-between px-1 pb-1">
        {["극도의 공포", "공포", "중립", "탐욕", "극도의 탐욕"].map(l => (
          <span key={l} className="text-[9px]" style={{ color: labelColor(l) }}>{l}</span>
        ))}
      </div>

      {sectors.map(s => {
        const isOpen = expanded === s.sector;
        const lColor = labelColor(s.label);
        const netFlow = s.investorFlow.foreign5d + s.investorFlow.institution5d;

        return (
          <div key={s.sector} className="bg-[#111118] border border-[#2a2a3a] rounded-xl overflow-hidden">
            <button className="w-full text-left px-4 pt-3 pb-2.5" onClick={() => setExpanded(isOpen ? null : s.sector)}>
              {/* Header row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{s.sector}</span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: lColor, background: `${lColor}18` }}
                  >
                    {s.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black" style={{ color: lColor }}>{s.total}</span>
                  <span className="text-[10px] text-[#555]">{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Gauge */}
              <GaugeBar score={s.total} />

              {/* Quick stats */}
              <div className="flex gap-3 mt-2">
                <span className="text-[10px] text-[#555]">
                  RSI <span className="text-[#aaa]">{s.components.rsi.detail.replace("RSI ", "")}</span>
                </span>
                <span className="text-[10px] text-[#555]">
                  MA비율 <span className="text-[#aaa]">{s.components.maBreadth.detail.split("(")[1]?.replace(")", "") ?? ""}</span>
                </span>
                <span className="text-[10px] text-[#555]">
                  5일 <span style={{ color: parseFloat(s.components.momentum.detail.split(" ")[2]) >= 0 ? "#ff4444" : "#4488ff" }}>
                    {s.components.momentum.detail.split(" ")[2]}
                  </span>
                </span>
                <span className="text-[10px] text-[#555]">
                  수급 <span style={{ color: netFlow >= 0 ? "#ff4444" : "#4488ff" }}>
                    {formatFlow(netFlow)}
                  </span>
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-[#2a2a3a] px-4 py-3 bg-[#0d0d18] space-y-4">
                {/* 5 components */}
                <div>
                  <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-2">구성 지표</p>
                  <CompRow icon="📈" name="RSI" score={s.components.rsi.score} label={s.components.rsi.label} detail={s.components.rsi.detail} />
                  <CompRow icon="📊" name="MA20 비율" score={s.components.maBreadth.score} label={s.components.maBreadth.label} detail={s.components.maBreadth.detail} />
                  <CompRow icon="🚀" name="5일 모멘텀" score={s.components.momentum.score} label={s.components.momentum.label} detail={s.components.momentum.detail} />
                  <CompRow icon="🔥" name="거래량" score={s.components.volume.score} label={s.components.volume.label} detail={s.components.volume.detail} />
                  <CompRow icon="📺" name="유튜브 심리" score={s.components.youtube.score} label={s.components.youtube.label} detail={s.components.youtube.detail} />
                </div>

                {/* Investor flow */}
                <div>
                  <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-1.5">외국인/기관 수급 (5일)</p>
                  <div className="flex gap-4 text-[11px]">
                    <span className="text-[#aaa]">
                      외국인 <span style={{ color: s.investorFlow.foreign5d >= 0 ? "#ff4444" : "#4488ff", fontWeight: "bold" }}>
                        {formatFlow(s.investorFlow.foreign5d)}
                      </span>
                    </span>
                    <span className="text-[#aaa]">
                      기관 <span style={{ color: s.investorFlow.institution5d >= 0 ? "#ff4444" : "#4488ff", fontWeight: "bold" }}>
                        {formatFlow(s.investorFlow.institution5d)}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Top stocks */}
                {s.topStocks.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-1.5">주요 종목</p>
                    <div className="flex flex-wrap gap-2">
                      {s.topStocks.map(st => (
                        <StockChip key={st.ticker} {...st} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
