"use client";

import { useEffect, useState } from "react";
import { getTopMentionedStocks } from "@/lib/api";

export function TopStocks() {
  const [stocks, setStocks] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopMentionedStocks(7, 10).then(d => { setStocks(d); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div style={{ background: "var(--card)", borderRadius: 20, padding: "24px", boxShadow: "var(--shadow)" }} className="animate-pulse">
        <div style={{ height: 16, background: "var(--border)", borderRadius: 8, width: "50%", marginBottom: 20 }} />
        {[...Array(5)].map((_, i) => <div key={i} style={{ height: 28, background: "var(--border)", borderRadius: 8, marginBottom: 10 }} />)}
      </div>
    );
  }

  const maxCount = stocks[0]?.count || 1;

  return (
    <div style={{ background: "var(--card)", borderRadius: 20, padding: "24px", boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>종목 언급 빈도 TOP 10</h2>
        <span style={{ fontSize: 13, color: "var(--text-3)" }}>최근 7일</span>
      </div>

      {stocks.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-3)" }}>데이터 없음</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {stocks.map((stock, i) => (
            <div key={stock.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, color: "var(--text-3)", width: 20, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>{stock.name}</span>
                  <span style={{ fontSize: 13, color: "var(--text-2)" }}>{stock.count}회</span>
                </div>
                <div style={{ height: 5, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${(stock.count / maxCount) * 100}%`, height: "100%", background: "var(--blue)", borderRadius: 99 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
