"use client";

type HomeSummary = {
  updated_at: string | null;
  market_risk_level: string;
  market_risk_score: number | null;
  market_regime: string | null;
  buy_ok_count: number;
  buy_small_count: number;
  watch_count: number;
  blocked_count: number;
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

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function TodayDecisionCard({ data }: { data: HomeSummary }) {
  const riskColor = RISK_COLOR[data.market_risk_level] ?? "#8b95a1";
  const freshOk   = data.avg_freshness !== null && data.avg_freshness >= 70;

  return (
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
        {[
          { label: "BUY_OK",    count: data.buy_ok_count,    color: "#00b493", bg: "#f0fdf4" },
          { label: "BUY_SMALL", count: data.buy_small_count, color: "#f5a623", bg: "#fff7ed" },
          { label: "WATCH",     count: data.watch_count,     color: "#3182f6", bg: "#f0f4ff" },
          { label: "BLOCKED",   count: data.blocked_count,   color: "#f04452", bg: "#fff0f0" },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
            <p style={{ fontSize: 10, color: c.color, fontWeight: 700, margin: "0 0 4px" }}>{c.label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: c.color, margin: 0 }}>{c.count}</p>
          </div>
        ))}
      </div>

      {/* 권장 행동 */}
      <div style={{ background: "#f8f9fa", borderRadius: 10, padding: "10px 14px" }}>
        <p style={{ fontSize: 13, color: "#4e5968", margin: 0, lineHeight: 1.6 }}>
          💡 {data.decision_text}
        </p>
      </div>
    </div>
  );
}
