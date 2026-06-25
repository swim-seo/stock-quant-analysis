"use client";

type Warning = {
  stock_name: string;
  reason: string;
  type: "blocked" | "stale";
};

export function RiskWarningList({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "18px 20px", border: "1px solid #fde8e8" }}>
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 11, color: "#f04452", letterSpacing: 1, margin: 0, fontWeight: 700 }}>RISK ALERT</p>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: "#191919", margin: 0 }}>주의 / 진입금지</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {warnings.map((w, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 12px", borderRadius: 10,
            background: w.type === "blocked" ? "#fff0f0" : "#fff7ed",
            border: `1px solid ${w.type === "blocked" ? "#fecaca" : "#fde68a"}`,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>
              {w.type === "blocked" ? "🚫" : "⚠️"}
            </span>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#191919" }}>{w.stock_name}</span>
              <span style={{ fontSize: 12, color: "#8b95a1", marginLeft: 8 }}>{w.reason}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
