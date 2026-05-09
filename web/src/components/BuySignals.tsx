"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface TimingStock {
  ticker: string;
  name: string;
  sector: string;
  composite_score: number;
  momentum_3m: number;
  momentum_6m: number;
  relative_strength_3m: number;
  volatility_20d: number;
  trading_signal: string | null;
  sentiment: string | null;
  reasons: string[];
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#f5a623" : score >= 55 ? "#00b493" : "#3182f6";
  const label = score >= 70 ? "상위권" : score >= 55 ? "진입검토" : "관찰";
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 6, color, background: `${color}18` }}>
      {label} {score}점
    </span>
  );
}

function SignalChip({ signal }: { signal: string | null }) {
  if (!signal) return null;
  const color = signal === "매수관심" ? "#00b493" : signal === "주의" ? "#f04452" : "#f5a623";
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 6, color, background: `${color}18` }}>
      뉴스 {signal}
    </span>
  );
}

export function BuySignals() {
  const [stocks, setStocks] = useState<TimingStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [calcAt, setCalcAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/timing")
      .then(r => r.json())
      .then(d => {
        setStocks(d.stocks || []);
        setCalcAt(d.calculated_at || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: 80, background: "var(--border)", borderRadius: 14 }} className="animate-pulse" />
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div style={{ background: "#fff", borderRadius: 16, padding: "32px", textAlign: "center" }}>
        <p style={{ fontSize: 15, color: "var(--text-3)", marginBottom: 8 }}>퀀트 데이터가 없습니다.</p>
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Railway에서 factor_calculator.py를 먼저 실행해주세요.</p>
      </div>
    );
  }

  return (
    <div>
      {/* 상단 설명 */}
      <div style={{ background: "#e8f3ff", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", marginBottom: 4 }}>📊 선정 기준</p>
        <p style={{ fontSize: 13, color: "#334" }}>
          퀀트 종합점수 45~78점 구간 (상승 초·중반, 과열 제외) + 뉴스 신호 보정 → 최대 8개 자동 선별
        </p>
        <p style={{ fontSize: 12, color: "#667", marginTop: 4 }}>
          ※ 100점에 가까울수록 이미 많이 오른 상태 — 55~75점 구간이 진입 적합
        </p>
        {calcAt && (
          <p style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            팩터 계산 기준: {new Date(calcAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stocks.map(stock => {
          const isOpen = expanded === stock.ticker;
          return (
            <div key={stock.ticker} style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
              {/* 요약 행 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px" }}>
                <button
                  onClick={() => router.push(`/stock?ticker=${encodeURIComponent(stock.ticker)}`)}
                  style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 10 }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{stock.name}</span>
                      <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--border)", color: "var(--text-3)" }}>{stock.sector}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <ScoreBadge score={stock.composite_score} />
                      <SignalChip signal={stock.trading_signal} />
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                        3M {stock.momentum_3m >= 0 ? "+" : ""}{stock.momentum_3m.toFixed(0)}%
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                        RS {stock.relative_strength_3m >= 0 ? "+" : ""}{stock.relative_strength_3m.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </button>
                {/* 근거 토글 */}
                <button
                  onClick={() => setExpanded(isOpen ? null : stock.ticker)}
                  style={{ flexShrink: 0, fontSize: 12, color: "var(--blue)", background: "#e8f3ff", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontWeight: 600 }}
                >
                  판단근거 {isOpen ? "▲" : "▼"}
                </button>
              </div>

              {/* 판단 근거 상세 */}
              {isOpen && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px", background: "#fafbff" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--blue)", marginBottom: 10 }}>이 종목이 선정된 이유</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {stock.reasons.map((r, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>✓</span>
                        <p style={{ fontSize: 13, color: "#222", lineHeight: 1.5 }}>{r}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 14, padding: "10px 12px", background: "#fff3cd", borderRadius: 10, borderLeft: "3px solid #f5a623" }}>
                    <p style={{ fontSize: 12, color: "#664" }}>
                      ⚠ 이 분석은 과거 데이터 기반 참고용입니다. 실제 진입 전 종목 상세 페이지에서 진입신호 5조건을 확인하세요.
                    </p>
                  </div>
                  <button
                    onClick={() => router.push(`/stock?ticker=${encodeURIComponent(stock.ticker)}`)}
                    style={{ marginTop: 10, width: "100%", padding: "10px", fontSize: 13, fontWeight: 700, borderRadius: 10, border: "1px solid var(--border)", background: "#fff", color: "var(--blue)", cursor: "pointer" }}
                  >
                    📊 {stock.name} 차트 · 진입신호 확인 →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
