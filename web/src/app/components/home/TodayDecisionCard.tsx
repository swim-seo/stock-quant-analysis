"use client";

import { useState } from "react";

type StockItem = { ticker: string; stock_name: string; composite_score: number | null };

type HomeSummary = {
  updated_at: string | null;
  market_risk_level: string;
  market_risk_score: number | null;
  market_regime: string | null;
  buy_ok_count: number;
  buy_small_count: number;
  watch_count: number;
  blocked_count: number;
  buy_ok_list?: StockItem[];
  buy_small_list?: StockItem[];
  watch_list?: StockItem[];
  blocked_list?: StockItem[];
  avg_freshness: number | null;
  decision_text: string;
};

const RISK_COLOR: Record<string, string> = {
  LOW:     "#00b493",
  MEDIUM:  "#f5a623",
  HIGH:    "#f04452",
  EXTREME: "#7c3aed",
};

const RISK_LABEL: Record<string, string> = {
  LOW:     "낮음",
  MEDIUM:  "보통",
  HIGH:    "높음",
  EXTREME: "매우 높음",
};

const REGIME_LABEL: Record<string, string> = {
  STRONG_BULL: "강한 상승장",
  BULL:        "상승장",
  NEUTRAL:     "중립",
  BEAR:        "하락장",
  STRONG_BEAR: "강한 하락장",
};

const SIGNAL_META: Record<string, { color: string; bg: string; label: string }> = {
  BUY_OK:    { color: "#00b493", bg: "#f0fdf4", label: "BUY_OK" },
  BUY_SMALL: { color: "#f5a623", bg: "#fff7ed", label: "BUY_SMALL" },
  WATCH:     { color: "#3182f6", bg: "#f0f4ff", label: "WATCH" },
  BLOCKED:   { color: "#f04452", bg: "#fff0f0", label: "BLOCKED" },
};

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function StockListModal({
  signal,
  stocks,
  onClose,
}: {
  signal: string;
  stocks: StockItem[];
  onClose: () => void;
}) {
  const meta = SIGNAL_META[signal];
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff", borderRadius: 16, padding: "20px 24px",
          width: 320, maxWidth: "90vw", maxHeight: "70vh",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          display: "flex", flexDirection: "column",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{
            padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800,
            background: meta.bg, color: meta.color,
          }}>
            {meta.label} · {stocks.length}종목
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 18, color: "#8b95a1", lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* 종목 목록 */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {stocks.length === 0 ? (
            <p style={{ textAlign: "center", color: "#aaa", fontSize: 13 }}>종목 없음</p>
          ) : (
            stocks.map((s, i) => (
              <div
                key={s.ticker}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: i < stocks.length - 1 ? "1px solid #f0f0f0" : "none",
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#191919" }}>
                    {s.stock_name}
                  </span>
                  <span style={{ fontSize: 11, color: "#8b95a1", marginLeft: 6 }}>
                    {s.ticker}
                  </span>
                </div>
                {s.composite_score !== null && (
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: meta.color,
                    background: meta.bg, padding: "2px 8px", borderRadius: 10,
                  }}>
                    {s.composite_score}점
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function TodayDecisionCard({ data }: { data: HomeSummary }) {
  const [activeSignal, setActiveSignal] = useState<string | null>(null);

  const riskColor = RISK_COLOR[data.market_risk_level] ?? "#8b95a1";
  const freshOk   = data.avg_freshness !== null && data.avg_freshness >= 70;

  const signalCells = [
    { label: "BUY_OK",    count: data.buy_ok_count,    list: data.buy_ok_list    ?? [], color: "#00b493", bg: "#f0fdf4" },
    { label: "BUY_SMALL", count: data.buy_small_count, list: data.buy_small_list ?? [], color: "#f5a623", bg: "#fff7ed" },
    { label: "WATCH",     count: data.watch_count,     list: data.watch_list     ?? [], color: "#3182f6", bg: "#f0f4ff" },
    { label: "BLOCKED",   count: data.blocked_count,   list: data.blocked_list   ?? [], color: "#f04452", bg: "#fff0f0" },
  ];

  const activeList = signalCells.find(c => c.label === activeSignal)?.list ?? [];

  return (
    <>
      <div style={{
        background: "#fff", borderRadius: 16,
        border: `2px solid ${riskColor}22`,
        padding: "18px 20px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <p style={{ fontSize: 11, color: "#8b95a1", letterSpacing: 1, margin: 0 }}>TODAY&apos;S DECISION</p>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: "#191919", margin: 0 }}>오늘의 결론</h2>
          </div>
          <span style={{ fontSize: 11, color: "#aaa" }}>업데이트 {fmtTime(data.updated_at)}</span>
        </div>

        {/* 시장 상태 행 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: `${riskColor}18`, color: riskColor,
          }}>
            위험 {RISK_LABEL[data.market_risk_level] ?? data.market_risk_level}
            {data.market_risk_score !== null && ` (${data.market_risk_score}점)`}
          </span>
          {data.market_regime && (
            <span style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: "#f0f4ff", color: "#3182f6",
            }}>
              {REGIME_LABEL[data.market_regime] ?? data.market_regime}
            </span>
          )}
          <span style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: freshOk ? "#f0fdf4" : "#fff7ed",
            color:      freshOk ? "#00b493"  : "#f5a623",
          }}>
            신선도 {freshOk ? "정상" : "일부 오래됨"}
            {data.avg_freshness !== null && ` (${data.avg_freshness}점)`}
          </span>
        </div>

        {/* 신호 카운트 그리드 */}
        <div className="grid-4col" style={{ marginBottom: 14 }}>
          {signalCells.map(c => (
            <button
              key={c.label}
              onClick={() => setActiveSignal(c.label)}
              style={{
                background: c.bg, borderRadius: 10, padding: "10px 8px", textAlign: "center",
                border: "none", cursor: "pointer",
                transition: "transform 0.1s, box-shadow 0.1s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; }}
            >
              <p style={{ fontSize: 10, color: c.color, fontWeight: 700, margin: "0 0 4px" }}>{c.label}</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: c.color, margin: 0 }}>{c.count}</p>
            </button>
          ))}
        </div>

        {/* 권장 행동 */}
        <div style={{ background: "#f8f9fa", borderRadius: 10, padding: "10px 14px" }}>
          <p style={{ fontSize: 13, color: "#4e5968", margin: 0, lineHeight: 1.6 }}>
            💡 {data.decision_text}
          </p>
        </div>
      </div>

      {/* 종목 목록 모달 */}
      {activeSignal && (
        <StockListModal
          signal={activeSignal}
          stocks={activeList}
          onClose={() => setActiveSignal(null)}
        />
      )}
    </>
  );
}
