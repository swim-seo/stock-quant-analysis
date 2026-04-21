"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SectorSignal } from "@/app/api/sector-signals/route";
import { NAME_TO_TICKER } from "@/lib/stocks";

function SignalBadge({ signal }: { signal: SectorSignal["signal"] }) {
  const cfg = {
    매수관심: { bg: "#00ff8820", text: "#00ff88", border: "#00ff8840" },
    관찰: { bg: "#ffd70020", text: "#ffd700", border: "#ffd70040" },
    중립: { bg: "#44444420", text: "#888", border: "#44444440" },
  }[signal];
  return (
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
    >
      {signal === "매수관심" ? "🟢 " : signal === "관찰" ? "🟡 " : "⚪ "}
      {signal}
    </span>
  );
}

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex-1 h-1.5 bg-[#1a1a2a] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(0, (value / max) * 100)}%`, background: color, opacity: 0.8 }}
      />
    </div>
  );
}

export function SectorSignals() {
  const [signals, setSignals] = useState<SectorSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sector-signals")
      .then(r => r.json())
      .then(d => setSignals(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-[#1a1a2a] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {signals.map((s) => {
        const isOpen = expanded === s.sector;
        return (
          <div
            key={s.sector}
            className="bg-[#111118] border border-[#2a2a3a] rounded-xl overflow-hidden"
          >
            {/* Row */}
            <button
              className="w-full text-left px-4 py-3"
              onClick={() => setExpanded(isOpen ? null : s.sector)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{s.sector}</span>
                  <SignalBadge signal={s.signal} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold" style={{ color: s.score >= 55 ? "#00ff88" : s.score >= 35 ? "#ffd700" : "#888" }}>
                    {s.score}점
                  </span>
                  <span className="text-[10px] text-[#555]">{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>
              {/* Score bars */}
              <div className="flex gap-1.5 items-center">
                <span className="text-[9px] text-[#555] w-10">유튜브</span>
                <ScoreBar value={s.ytScore} max={40} color="#4d9fff" />
                <span className="text-[9px] text-[#555] w-8">거래량</span>
                <ScoreBar value={s.volumeScore} max={30} color="#ffd700" />
                <span className="text-[9px] text-[#555] w-10">수급</span>
                <ScoreBar value={Math.max(0, s.investorScore)} max={30} color="#00ff88" />
              </div>
              <p className="text-[10px] text-[#8a8a9a] mt-1.5">{s.reason}</p>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="border-t border-[#2a2a3a] px-4 py-3 bg-[#0d0d18] space-y-3">
                {/* YouTube detail */}
                <div>
                  <p className="text-[11px] font-semibold text-[#4d9fff] mb-1">📺 유튜브 언급</p>
                  <div className="flex gap-4 text-[11px] text-[#aaa]">
                    <span>이번주 <span className="text-white font-bold">{s.ytDetail.thisWeek}건</span></span>
                    <span>지난주 <span className="text-white font-bold">{s.ytDetail.lastWeek}건</span></span>
                    <span className="text-[#00ff88]">긍정 {s.ytDetail.positive}건</span>
                    <span className="text-[#ff4444]">부정 {s.ytDetail.negative}건</span>
                  </div>
                </div>
                {/* Volume detail */}
                <div>
                  <p className="text-[11px] font-semibold text-[#ffd700] mb-1">📊 거래량</p>
                  <div className="text-[11px] text-[#aaa]">
                    <span>평균 <span className="text-white font-bold">{s.volumeDetail.avgRatio}x</span></span>
                    {s.volumeDetail.surgingStocks.length > 0 && (
                      <span className="ml-3 text-[#ffd700]">급증: {s.volumeDetail.surgingStocks.slice(0, 3).join(", ")}</span>
                    )}
                  </div>
                </div>
                {/* Investor detail */}
                <div>
                  <p className="text-[11px] font-semibold text-[#00ff88] mb-1">💰 외국인+기관 수급 (5일)</p>
                  <div className="flex gap-4 text-[11px] text-[#aaa]">
                    <span>외국인 <span className={s.investorDetail.foreign5d >= 0 ? "text-[#ff4444]" : "text-[#4488ff]"} style={{ fontWeight: "bold" }}>
                      {s.investorDetail.foreign5d >= 0 ? "+" : ""}{(s.investorDetail.foreign5d / 100).toFixed(0)}백만
                    </span></span>
                    <span>기관 <span className={s.investorDetail.institution5d >= 0 ? "text-[#ff4444]" : "text-[#4488ff]"} style={{ fontWeight: "bold" }}>
                      {s.investorDetail.institution5d >= 0 ? "+" : ""}{(s.investorDetail.institution5d / 100).toFixed(0)}백만
                    </span></span>
                  </div>
                </div>
                {/* Stock links */}
                <div className="flex flex-wrap gap-1.5">
                  {s.topStocks.map(name => {
                    const ticker = NAME_TO_TICKER[name];
                    return ticker ? (
                      <Link
                        key={name}
                        href={`/stock?ticker=${ticker}`}
                        className="text-[10px] px-2 py-0.5 rounded border border-[#2a2a3a] text-[#8a8a9a] hover:text-[#ffd700] hover:border-[#ffd70040] transition-colors"
                      >
                        {name} →
                      </Link>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
