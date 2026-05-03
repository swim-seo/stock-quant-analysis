"use client";

import { useEffect, useState } from "react";

interface Alert {
  id: number;
  created_at: string;
  mode: string;
  step: string;
  diagnosis: string;
  resolved: boolean;
}

export function PipelineAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/pipeline-alerts")
      .then(r => r.json())
      .then(d => setAlerts((d.alerts ?? []).filter((a: Alert) => !a.resolved)));
  }, []);

  if (alerts.length === 0) return null;

  async function resolve(id: number) {
    await fetch("/api/pipeline-alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto 0", padding: "16px 24px 0" }}>
      {alerts.map(alert => (
        <div key={alert.id} style={{
          background: "#fff8e6",
          border: "1px solid #ffc107",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#856404" }}>
                파이프라인 오류: {alert.step}
              </span>
              <span style={{ fontSize: 12, color: "#aaa" }}>
                {alert.mode} · {new Date(alert.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}
                style={{ fontSize: 12, color: "#856404", background: "none", border: "1px solid #ffc107", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}
              >
                {expanded === alert.id ? "접기" : "진단 보기"}
              </button>
              <button
                onClick={() => resolve(alert.id)}
                style={{ fontSize: 12, color: "#555", background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}
              >
                해결됨
              </button>
            </div>
          </div>
          {expanded === alert.id && (
            <div style={{
              background: "#fffdf0",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#333",
              whiteSpace: "pre-wrap",
              marginTop: 4,
            }}>
              {alert.diagnosis}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
