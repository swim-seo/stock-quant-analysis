"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { StockHeat, SectorHeat } from "@/lib/market-types";

function formatValue(n: number): string {
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(1) + "조";
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(0) + "억";
  if (n >= 10_000) return (n / 10_000).toFixed(0) + "만";
  return n.toLocaleString();
}

function ChangeText({ pct }: { pct: number }) {
  const color = pct > 0 ? "#f04452" : pct < 0 ? "#3182f6" : "var(--text-3)";
  return <span style={{ fontSize: 14, fontWeight: 700, color }}>{pct > 0 ? "+" : ""}{pct}%</span>;
}

function VolumeBadge({ ratio }: { ratio: number }) {
  if (ratio >= 2.0) return <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "#fff0f1", color: "#f04452", fontWeight: 700 }}>🔥 {ratio}x</span>;
  if (ratio >= 1.5) return <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "#fff8e6", color: "#f5a623", fontWeight: 700 }}>↑ {ratio}x</span>;
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
    <div style={{ background: "var(--card)", borderRadius: 20, overflow: "hidden", boxShadow: "var(--shadow)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>거래대금 현황</p>
        <div style={{ display: "flex", gap: 4, background: "var(--bg)", padding: 3, borderRadius: 10 }}>
          {(["sectors", "stocks"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: tab === t ? "var(--blue)" : "transparent", color: tab === t ? "#fff" : "var(--text-3)" }}>
              {t === "sectors" ? "섹터" : "종목"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(5)].map((_, i) => <div key={i} style={{ height: 52, background: "var(--border)", borderRadius: 10 }} className="animate-pulse" />)}
          </div>
        ) : tab === "sectors" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {sectors.map((s, i) => (
              <div key={s.sector}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "var(--text-3)", width: 16 }}>{i + 1}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{s.sector}</span>
                    <ChangeText pct={s.avgChangePct} />
                  </div>
                  <span style={{ fontSize: 14, color: "var(--text-2)", fontWeight: 600 }}>{formatValue(s.totalValue)}</span>
                </div>
                <div style={{ marginLeft: 26, height: 5, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: `${(s.totalValue / maxSectorValue) * 100}%`, height: "100%", background: s.avgChangePct >= 0 ? "#f04452" : "#3182f6", opacity: 0.7, borderRadius: 99 }} />
                </div>
                <div style={{ marginLeft: 26, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {s.stocks.slice(0, 3).map(st => (
                    <Link key={st.ticker} href={`/stock?ticker=${st.ticker}`}
                      style={{ fontSize: 13, padding: "3px 10px", borderRadius: 20, border: "1px solid var(--border)", color: "var(--text-2)", textDecoration: "none", fontWeight: 500 }}>
                      {st.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {stocks.map((s, i) => (
              <Link key={s.ticker} href={`/stock?ticker=${s.ticker}`}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 8px", borderBottom: i < stocks.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "var(--text-3)", width: 20 }}>{i + 1}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{s.name}</span>
                      <VolumeBadge ratio={s.volumeRatio} />
                    </div>
                    <span style={{ fontSize: 13, color: "var(--text-3)" }}>{s.sector}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 13, color: "var(--text-2)" }}>{formatValue(s.tradingValue)}</p>
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
