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
  score: number;
  reasons: string[];
}

export function TopStocks() {
  const [stocks, setStocks] = useState<UndervaluedStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/undervalued")
      .then(r => r.json())
      .then(d => { setStocks(d.stocks || []); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div style={{ background: "var(--card)", borderRadius: 20, padding: "14px 20px", boxShadow: "var(--shadow)" }} className="animate-pulse">
        <div style={{ height: 14, background: "var(--border)", borderRadius: 8, width: "60%" }} />
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", borderRadius: 20, boxShadow: "var(--shadow)", overflow: "hidden" }}>
      {/* 항상 표시: 한 줄 요약 + 토글 */}
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "14px 20px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)", flexShrink: 0 }}>저평가 우량주</span>
        <span style={{ flex: 1, fontSize: 12, color: "var(--text-3)" }}>PBR·ROE·PER 종합</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#00b493", flexShrink: 0 }}>
          {stocks.length > 0 ? `${stocks.length}개 발견` : "해당 없음"}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-3)", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* 펼치면 상세 목록 */}
      {open && (
        <div style={{ padding: "0 20px 20px" }}>
          {stocks.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--text-3)" }}>조건을 충족하는 종목이 없습니다.</p>
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
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
