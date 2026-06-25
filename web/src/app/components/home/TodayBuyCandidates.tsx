"use client";
import Link from "next/link";

type Candidate = {
  ticker: string;
  stock_name: string;
  execution_signal: string;
  composite_score: number;
  freshness_score: number | null;
  has_catalyst: boolean;
  position_pct: number | null;
  take_profit_pct: number | null;
  stop_loss_pct: number | null;
  max_holding_days: number | null;
  market_risk_level: string;
};

const SIG_COLOR: Record<string, string> = {
  BUY_OK:    "#00b493",
  BUY_SMALL: "#f5a623",
  WATCH:     "#3182f6",
};

export function TodayBuyCandidates({ candidates }: { candidates: Candidate[] }) {
  if (candidates.length === 0) {
    return (
      <div style={{ background: "#fff", borderRadius: 16, padding: "18px 20px", border: "1px solid var(--border)" }}>
        <p style={{ fontSize: 11, color: "#8b95a1", letterSpacing: 1, margin: "0 0 4px" }}>TODAY&apos;S PICKS</p>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: "#191919", margin: "0 0 12px" }}>오늘 매수 후보</h2>
        <p style={{ color: "#b0b8c1", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
          현재 매수 가능 신호가 없습니다.<br />
          <span style={{ fontSize: 12 }}>시장 위험도가 낮아지면 신호가 나타납니다.</span>
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "18px 20px", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 11, color: "#8b95a1", letterSpacing: 1, margin: 0 }}>TODAY&apos;S PICKS</p>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: "#191919", margin: 0 }}>오늘 매수 후보 TOP {candidates.length}</h2>
        </div>
        <span style={{ fontSize: 11, color: "#aaa" }}>최대 3개</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {candidates.map((c, i) => {
          const sigColor = SIG_COLOR[c.execution_signal] ?? "#8b95a1";
          return (
            <Link key={c.ticker} href={`/stock?ticker=${c.ticker}`} style={{ textDecoration: "none" }}>
              <div style={{
                borderRadius: 12, padding: "12px 14px",
                border: `1px solid ${sigColor}33`,
                background: `${sigColor}08`,
                display: "flex", alignItems: "flex-start", gap: 12,
              }}>
                {/* 순위 */}
                <span style={{ fontSize: 18, fontWeight: 900, color: sigColor, minWidth: 24 }}>{i + 1}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* 종목명 + 배지 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#191919" }}>{c.stock_name}</span>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: sigColor, color: "#fff" }}>
                      {c.execution_signal}
                    </span>
                    {c.has_catalyst && (
                      <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "#fff7ed", color: "#f5a623" }}>
                        촉매 있음
                      </span>
                    )}
                    {c.freshness_score !== null && (
                      <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, color: "#8b95a1", background: "#f0f2f5" }}>
                        신선도 {c.freshness_score}
                      </span>
                    )}
                  </div>

                  {/* 비중/익절/손절/보유 */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {c.position_pct && (
                      <span style={{ fontSize: 12, color: "#4e5968" }}>비중 <b style={{ color: "#3182f6" }}>{c.position_pct}%</b></span>
                    )}
                    {c.take_profit_pct && (
                      <span style={{ fontSize: 12, color: "#4e5968" }}>익절 <b style={{ color: "#f04452" }}>+{c.take_profit_pct}%</b></span>
                    )}
                    {c.stop_loss_pct && (
                      <span style={{ fontSize: 12, color: "#4e5968" }}>손절 <b style={{ color: "#3182f6" }}>-{c.stop_loss_pct}%</b></span>
                    )}
                    {c.max_holding_days && (
                      <span style={{ fontSize: 12, color: "#8b95a1" }}>최대 {c.max_holding_days}일</span>
                    )}
                  </div>
                </div>

                <span style={{ fontSize: 16, fontWeight: 800, color: sigColor, whiteSpace: "nowrap" }}>
                  {c.composite_score}점
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 액션 버튼 */}
      <div style={{ display: "flex", gap: 8 }}>
        <Link href="/signals?tab=sniper" style={{
          flex: 1, textAlign: "center", padding: "10px", borderRadius: 10,
          background: "linear-gradient(135deg, #f04452, #f5a623)", color: "#fff",
          fontSize: 13, fontWeight: 700, textDecoration: "none",
        }}>
          ⚡ 오늘 매수 전체 보기
        </Link>
        <Link href="/signals" style={{
          flex: 1, textAlign: "center", padding: "10px", borderRadius: 10,
          background: "#f0f4ff", color: "#3182f6",
          fontSize: 13, fontWeight: 700, textDecoration: "none",
        }}>
          📡 신호센터
        </Link>
      </div>
    </div>
  );
}
