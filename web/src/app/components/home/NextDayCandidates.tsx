"use client";

import { useEffect, useState } from "react";

type Candidate = {
  ticker: string;
  stock_name: string;
  close_price: number | null;
  close_hold_score: number | null;
  next_day_score: number | null;
  reason: string[] | null;
  risk_flags: string[] | null;
  status: string;
  final_execution_signal: string | null;
  rejection_reason: string | null;
  signal_date: string;
  target_date: string;
};

type ApiResponse = {
  as_of: string;
  approved: Candidate[];
  pending: Candidate[];
  rejected: Candidate[];
  total: number;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  APPROVED: { label: "승인",     color: "#00b493", bg: "#f0fdf4" },
  PENDING:  { label: "대기중",   color: "#f5a623", bg: "#fff7ed" },
  REJECTED: { label: "탈락",     color: "#f04452", bg: "#fff0f0" },
  ENTERED:  { label: "진입",     color: "#3182f6", bg: "#f0f4ff" },
};

const SIG_META: Record<string, { color: string }> = {
  BUY_OK:    { color: "#00b493" },
  BUY_SMALL: { color: "#f5a623" },
  WATCH:     { color: "#3182f6" },
  BLOCKED:   { color: "#f04452" },
};

function ScoreBadge({ score, label }: { score: number | null; label: string }) {
  if (score === null) return null;
  const color = score >= 80 ? "#00b493" : score >= 65 ? "#f5a623" : "#8b95a1";
  return (
    <span style={{ fontSize: 11, color, fontWeight: 700 }}>
      {label} {score}점
    </span>
  );
}

function CandidateRow({ c }: { c: Candidate }) {
  const [expanded, setExpanded] = useState(false);
  const sm = STATUS_META[c.status] ?? STATUS_META.PENDING;
  const sigMeta = c.final_execution_signal ? SIG_META[c.final_execution_signal] : null;

  return (
    <div
      style={{
        borderRadius: 10, border: "1px solid #f0f0f0",
        background: "#fafafa", marginBottom: 8, overflow: "hidden",
      }}
    >
      {/* 헤더 행 */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: "100%", background: "none", border: "none",
          padding: "10px 14px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10, textAlign: "left",
        }}
      >
        {/* 상태 배지 */}
        <span style={{
          padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700,
          background: sm.bg, color: sm.color, flexShrink: 0,
        }}>
          {sm.label}
        </span>

        {/* 종목명 */}
        <span style={{ fontSize: 13, fontWeight: 700, color: "#191919", flex: 1 }}>
          {c.stock_name}
          <span style={{ fontSize: 11, color: "#8b95a1", marginLeft: 5 }}>{c.ticker}</span>
        </span>

        {/* 점수 */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <ScoreBadge score={c.close_hold_score} label="버팀" />
          <ScoreBadge score={c.next_day_score}   label="종합" />
        </div>

        {/* execution signal */}
        {sigMeta && c.final_execution_signal && (
          <span style={{ fontSize: 10, color: sigMeta.color, fontWeight: 800, flexShrink: 0 }}>
            {c.final_execution_signal}
          </span>
        )}

        <span style={{ color: "#ccc", fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {/* 확장 상세 */}
      {expanded && (
        <div style={{ padding: "0 14px 12px", borderTop: "1px solid #f0f0f0" }}>
          {/* 종가 */}
          {c.close_price && (
            <p style={{ fontSize: 12, color: "#4e5968", margin: "8px 0 4px" }}>
              종가 {c.close_price.toLocaleString()}원
            </p>
          )}

          {/* 사유 */}
          {c.reason && c.reason.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {c.reason.map((r, i) => (
                <span key={i} style={{
                  display: "inline-block", marginRight: 6, marginBottom: 4,
                  padding: "2px 8px", borderRadius: 10,
                  fontSize: 11, background: "#f0fdf4", color: "#00b493",
                }}>
                  ✓ {r}
                </span>
              ))}
            </div>
          )}

          {/* 리스크 플래그 */}
          {c.risk_flags && c.risk_flags.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {c.risk_flags.map((f, i) => (
                <span key={i} style={{
                  display: "inline-block", marginRight: 6, marginBottom: 4,
                  padding: "2px 8px", borderRadius: 10,
                  fontSize: 11, background: "#fff0f0", color: "#f04452",
                }}>
                  ⚠ {f}
                </span>
              ))}
            </div>
          )}

          {/* 탈락 사유 */}
          {c.rejection_reason && (
            <p style={{ fontSize: 11, color: "#f04452", margin: "6px 0 0" }}>
              탈락 사유: {c.rejection_reason}
            </p>
          )}

          {/* 갭 과열 안내 (APPROVED만) */}
          {c.status === "APPROVED" && (
            <p style={{
              fontSize: 11, color: "#8b95a1", margin: "8px 0 0",
              padding: "6px 8px", background: "#f8f9fa", borderRadius: 6,
            }}>
              💡 시초가 +7% 이상 갭상승 시 추격매수 금지
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function NextDayCandidates() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [tab, setTab] = useState<"approved" | "pending" | "rejected">("approved");

  useEffect(() => {
    fetch("/api/next-day-candidates")
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.total === 0) return null;

  const lists: Record<string, Candidate[]> = {
    approved: data.approved,
    pending:  data.pending,
    rejected: data.rejected,
  };
  const active = lists[tab];

  const hasApproved = data.approved.length > 0;
  const hasPending  = data.pending.length  > 0;

  return (
    <div style={{
      background: "#fff", borderRadius: 16,
      border: "1.5px solid #e8f4ff",
      padding: "18px 20px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 11, color: "#3182f6", letterSpacing: 1, margin: 0, fontWeight: 700 }}>
          NEXT DAY
        </p>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: "#191919", margin: "2px 0 4px" }}>
          내일 매수 후보
        </h2>
        <p style={{ fontSize: 12, color: "#8b95a1", margin: 0 }}>
          {hasApproved
            ? `아침 승인 완료 · ${data.approved.length}종목`
            : hasPending
            ? `전일 종가 기준 후보 · 아침 최종 승인 전`
            : "후보 없음"}
        </p>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["approved", "pending", "rejected"] as const).map(t => {
          const cnt = lists[t].length;
          const isActive = tab === t;
          const color = t === "approved" ? "#00b493" : t === "pending" ? "#f5a623" : "#f04452";
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                cursor: "pointer", border: "none",
                background: isActive ? color : "#f0f0f0",
                color:      isActive ? "#fff"  : "#8b95a1",
              }}
            >
              {t === "approved" ? "승인" : t === "pending" ? "대기" : "탈락"} {cnt}
            </button>
          );
        })}
      </div>

      {/* 후보 목록 */}
      {active.length === 0 ? (
        <p style={{ textAlign: "center", color: "#aaa", fontSize: 13, padding: "16px 0" }}>
          {tab === "approved" ? "아직 승인된 후보가 없습니다." :
           tab === "pending"  ? "대기 중인 후보가 없습니다." :
           "탈락 후보가 없습니다."}
        </p>
      ) : (
        active.map(c => <CandidateRow key={`${c.signal_date}-${c.ticker}`} c={c} />)
      )}

      {/* 주의 문구 (PENDING 탭) */}
      {tab === "pending" && hasPending && (
        <p style={{
          fontSize: 11, color: "#f5a623", margin: "8px 0 0",
          padding: "8px 10px", background: "#fff7ed", borderRadius: 8,
        }}>
          ⚠ 아침 최종 승인 전까지 실제 매수는 보류하세요.
          미국장·뉴스·공시·시장위험도 반영 후 최종 결정됩니다.
        </p>
      )}
    </div>
  );
}
