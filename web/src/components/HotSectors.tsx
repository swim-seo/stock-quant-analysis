"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { StockHeat, SectorHeat } from "@/app/api/hot-stocks/route";

function formatValue(n: number): string {
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(1) + "조";
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(0) + "억";
  if (n >= 10_000) return (n / 10_000).toFixed(0) + "만";
  return n.toLocaleString();
}

function ChangeText({ pct }: { pct: number }) {
  const color = pct > 0 ? "#ff4444" : pct < 0 ? "#4488ff" : "#888";
  return (
    <span className="text-xs font-semibold" style={{ color }}>
      {pct > 0 ? "+" : ""}{pct}%
    </span>
  );
}

function VolumeBadge({ ratio }: { ratio: number }) {
  if (ratio >= 2.0) return <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "#ff444420", color: "#ff4444" }}>🔥 {ratio}x</span>;
  if (ratio >= 1.5) return <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "#ffd70020", color: "#ffd700" }}>↑ {ratio}x</span>;
  return null;
}

export function HotSectors() {
  const [tab, setTab] = useState<"stocks" | "sectors">("sectors");
  const [stocks, setStocks] = useState<StockHeat[]>([]);
  const [sectors, setSectors] = useState<SectorHeat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/hot-stocks")
      .then(r => r.json())
      .then(d => { setStocks(d.stocks ?? []); setSectors(d.sectors ?? []); })
      .finally(() => setLoading(false));
  }, []);

  const maxSectorValue = sectors[0]?.totalValue ?? 1;

  return (
    <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a3a]">
        <p className="text-xs font-bold text-white">거래대금 현황</p>
        <div className="flex gap-1 bg-[#0a0a12] p-0.5 rounded-lg">
          {(["sectors", "stocks"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1 text-[11px] font-semibold rounded-md transition-colors"
              style={{
                background: tab === t ? "#2a2a3a" : "transparent",
                color: tab === t ? "#ffffff" : "#555",
              }}
            >
              {t === "sectors" ? "섹터" : "종목"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-[#1a1a2a] rounded animate-pulse" />
            ))}
          </div>
        ) : tab === "sectors" ? (
          /* 섹터 탭 */
          <div className="space-y-2">
            {sectors.map((s, i) => (
              <div key={s.sector}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#555] w-3">{i + 1}</span>
                    <span className="text-xs font-semibold text-white">{s.sector}</span>
                    <ChangeText pct={s.avgChangePct} />
                  </div>
                  <span className="text-[11px] text-[#aaa]">{formatValue(s.totalValue)}</span>
                </div>
                {/* 바 차트 */}
                <div className="ml-5 h-1.5 bg-[#1a1a2a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(s.totalValue / maxSectorValue) * 100}%`,
                      background: s.avgChangePct >= 0 ? "#ff4444" : "#4488ff",
                      opacity: 0.7,
                    }}
                  />
                </div>
                {/* 섹터 내 종목 태그 */}
                <div className="ml-5 flex flex-wrap gap-1 mt-1">
                  {s.stocks.slice(0, 3).map(st => (
                    <Link
                      key={st.ticker}
                      href={`/stock?ticker=${st.ticker}`}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-[#2a2a3a] text-[#8a8a9a] hover:text-[#ffd700] hover:border-[#ffd70040] transition-colors"
                    >
                      {st.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* 종목 탭 */
          <div className="space-y-1">
            {stocks.map((s, i) => (
              <Link
                key={s.ticker}
                href={`/stock?ticker=${s.ticker}`}
                className="flex items-center justify-between py-1.5 border-b border-[#1a1a2a] last:border-b-0 hover:bg-[#1a1a2a] px-1 rounded transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#555] w-4">{i + 1}</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-white">{s.name}</span>
                      <VolumeBadge ratio={s.volumeRatio} />
                    </div>
                    <span className="text-[10px] text-[#555]">{s.sector}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-[#aaa]">{formatValue(s.tradingValue)}</p>
                  <ChangeText pct={s.changePct} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
