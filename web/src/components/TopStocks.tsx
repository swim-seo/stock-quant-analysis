"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface UndervaluedStock {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  pbr: number | null;
  per: number | null;
  roe: number | null;
  dividendYield: number | null;
  score: number;
  reasons: string[];
}

export function TopStocks() {
  const [stocks, setStocks] = useState<UndervaluedStock[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/undervalued")
      .then(r => r.json())
      .then(d => { setStocks(d.stocks || []); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div style={{ background: "var(--card)", borderRadius: 20, padding: "24px", boxShadow: "var(--shadow)" }} className="animate-pulse">
        <div style={{ height: 16, background: "var(--border)", borderRadius: 8, width: "60%", marginBottom: 20 }} />
        {[...Array(5)].map((_, i) => <div key={i} style={{ height: 36, background: "var(--border)", borderRadius: 8, marginBottom: 10 }} />)}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", borderRadius: 20, padding: "24px", boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>저평가 우량주</h2>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>PBR·ROE·PER 기준</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>
        PBR 낮고 ROE·배당 높은 종목
      </p>

      {stocks.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-3)" }}>데이터 없음</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {stocks.map((stock, i) => {
            const isUp = stock.changePct >= 0;
            const changeColor = isUp ? "#f04452" : "#3182f6";

            return (
              <button
                key={stock.ticker}
                onClick={() => router.push(`/stock?ticker=${encodeURIComponent(stock.ticker)}`)}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "10px 12px", borderRadius: 12,
                  border: "1px solid var(--border)", background: "var(--bg)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--text-3)", width: 16 }}>{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{stock.name}</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--border)", color: "var(--text-3)" }}>
                      {stock.sector}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: changeColor }}>
                    {isUp ? "+" : ""}{stock.changePct}%
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {stock.pbr !== null && (
                    <span style={{ fontSize: 11, color: stock.pbr < 1 ? "#00b493" : "var(--text-3)" }}>
                      PBR {stock.pbr.toFixed(2)}
                    </span>
                  )}
                  {stock.per !== null && (
                    <span style={{ fontSize: 11, color: stock.per < 12 ? "#00b493" : "var(--text-3)" }}>
                      PER {stock.per.toFixed(1)}
                    </span>
                  )}
                  {stock.roe !== null && (
                    <span style={{ fontSize: 11, color: stock.roe > 10 ? "#00b493" : "var(--text-3)" }}>
                      ROE {stock.roe.toFixed(1)}%
                    </span>
                  )}
                  {stock.dividendYield !== null && stock.dividendYield > 0 && (
                    <span style={{ fontSize: 11, color: "#f5a623" }}>
                      배당 {stock.dividendYield.toFixed(1)}%
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
