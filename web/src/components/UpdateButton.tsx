"use client";

import { useState, useEffect, useCallback } from "react";

type Status = {
  running: boolean;
  last_run: string | null;
  last_mode: string | null;
  result: string | null;
};

export function UpdateButton({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status>({ running: false, last_run: null, last_mode: null, result: null });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/trigger-pipeline");
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  // 실행 중이면 5초마다 폴링
  useEffect(() => {
    if (!status.running) return;
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [status.running, fetchStatus]);

  const handleTrigger = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/trigger-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "morning" }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setMessage("이미 실행 중입니다");
      } else if (res.status === 503) {
        setMessage("서버 미설정 (PIPELINE_TRIGGER_URL)");
      } else if (res.ok) {
        setMessage("수집 시작됨 — 완료까지 5~10분 소요");
        setStatus((s) => ({ ...s, running: true }));
      } else {
        setMessage(data.error ?? "오류 발생");
      }
    } catch (e) {
      setMessage(String(e));
    } finally {
      setLoading(false);
    }
  };

  const isRunning = status.running || loading;

  if (compact) {
    return (
      <button
        onClick={handleTrigger}
        disabled={isRunning}
        title={isRunning ? "수집 중..." : "지금 업데이트"}
        style={{
          width: 20, height: 20, padding: 0,
          fontSize: 13, border: "none", background: "none",
          cursor: isRunning ? "not-allowed" : "pointer",
          color: isRunning ? "#94a3b8" : "#aaa",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1,
        }}
      >
        <span style={isRunning ? { animation: "spin 1s linear infinite", display: "inline-block" } : {}}>⟳</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {message && (
        <span style={{ fontSize: 11, color: isRunning ? "#2563eb" : "#888" }}>
          {message}
        </span>
      )}
      {status.result && !isRunning && (
        <span style={{ fontSize: 11, color: status.result === "success" ? "#16a34a" : "#dc2626" }}>
          {status.result === "success" ? "✓ 완료" : `✗ ${status.result}`}
        </span>
      )}
      <button
        onClick={handleTrigger}
        disabled={isRunning}
        style={{
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          background: isRunning ? "#f1f5f9" : "#1e40af",
          color: isRunning ? "#94a3b8" : "#fff",
          cursor: isRunning ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          transition: "all 0.15s",
        }}
      >
        {isRunning ? (
          <>
            <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
            수집 중...
          </>
        ) : (
          <>⟳ 지금 업데이트</>
        )}
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
