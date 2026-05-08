"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

interface FactorRow {
  ticker: string;
  stock_name: string;
  sector: string;
  rank_total: number;
  composite_score: number;
  momentum_3m: number | null;
  momentum_6m: number | null;
  momentum_12m: number | null;
  relative_strength_3m: number | null;
  volatility_20d: number | null;
  foreign_flow_5d: number | null;
  institution_flow_5d: number | null;
  z_momentum: number | null;
  z_rs: number | null;
  z_volatility: number | null;
  z_flow: number | null;
  calculated_at: string;
}

const SECTORS = [
  "전체", "반도체", "2차전지/에너지", "바이오", "자동차",
  "IT/플랫폼", "금융", "소재/산업재", "조선", "방산",
  "원자력", "건설", "우주항공", "화장품", "로봇", "광통신",
];

function scoreColor(score: number) {
  if (score >= 75) return "#00b493";
  if (score >= 55) return "#3182f6";
  if (score >= 40) return "#888";
  if (score >= 25) return "#f5a623";
  return "#f04452";
}

function pct(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function flowK(v: number | null) {
  if (v == null || v === 0) return "—";
  const k = Math.round(v / 1000);
  return `${k >= 0 ? "+" : ""}${k.toLocaleString()}K`;
}

function ZBar({ z }: { z: number | null }) {
  if (z == null) return <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>;
  const clamped = Math.max(-3, Math.min(3, z));
  const pct = ((clamped + 3) / 6) * 100;
  const color = z >= 0.5 ? "#00b493" : z >= -0.5 ? "#aaa" : "#f04452";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600, minWidth: 34 }}>
        {z >= 0 ? "+" : ""}{z.toFixed(2)}
      </span>
    </div>
  );
}

export default function ScreenerPage() {
  const [rows, setRows] = useState<FactorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sector, setSector] = useState("전체");
  const [sortKey, setSortKey] = useState<keyof FactorRow>("composite_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    setLoading(true);
    const url = sector === "전체" ? "/api/screener" : `/api/screener?sector=${encodeURIComponent(sector)}`;
    fetch(url)
      .then(r => r.json())
      .then((data: FactorRow[]) => {
        setRows(data);
        if (data.length > 0) {
          const d = new Date(data[0].calculated_at);
          setUpdatedAt(d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sector]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey] as number ?? 0;
      const bv = b[sortKey] as number ?? 0;
      return sortAsc ? av - bv : bv - av;
    });
    return copy;
  }, [rows, sortKey, sortAsc]);

  function handleSort(key: keyof FactorRow) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(false); }
  }

  const Th = ({ label, k, right = true }: { label: string; k: keyof FactorRow; right?: boolean }) => (
    <th onClick={() => handleSort(k)} style={{
      padding: "10px 12px", fontSize: 12, fontWeight: 600,
      color: sortKey === k ? "var(--blue)" : "var(--text-3)",
      textAlign: right ? "right" : "left", cursor: "pointer",
      whiteSpace: "nowrap", background: "var(--bg-2)", borderBottom: "1px solid var(--border)",
    }}>
      {label}{sortKey === k ? (sortAsc ? " ↑" : " ↓") : ""}
    </th>
  );

  const empty = !loading && rows.length === 0;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "16px 24px" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <Link href="/" style={{ fontSize: 12, color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}>
              ← 대시보드
            </Link>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", marginTop: 4 }}>
              퀀트 스크리너
            </h1>
            {updatedAt && (
              <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                팩터 계산 기준: {updatedAt} · {rows.length}개 종목
              </p>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", maxWidth: 320, lineHeight: 1.6 }}>
            모멘텀 40% · 상대강도 25% · 저변동성 15% · 수급 20%
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "20px 24px" }}>

        {/* 섹터 필터 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
          {SECTORS.map(s => (
            <button key={s} onClick={() => setSector(s)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                border: "1px solid var(--border)", cursor: "pointer",
                background: sector === s ? "var(--blue)" : "#fff",
                color: sector === s ? "#fff" : "var(--text-2)",
              }}>
              {s}
            </button>
          ))}
        </div>

        {/* 범례 */}
        <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          {[["75+ 최상위", "#00b493"], ["55~75 상위", "#3182f6"], ["40~55 중립", "#888"], ["25~40 하위", "#f5a623"], ["~25 최하위", "#f04452"]].map(([l, c]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: c as string }} />
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>{l}</span>
            </div>
          ))}
        </div>

        {/* 테이블 */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(10)].map((_, i) => (
              <div key={i} style={{ height: 52, background: "var(--border)", borderRadius: 10 }} className="animate-pulse" />
            ))}
          </div>
        )}

        {empty && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 48, textAlign: "center" }}>
            <p style={{ fontSize: 16, color: "var(--text-3)" }}>
              팩터 데이터가 없습니다.
            </p>
            <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 8 }}>
              Railway에서 <code>python factor_calculator.py</code> 를 실행하거나 다음 Railway cron까지 기다려주세요.
            </p>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow)" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th label="순위" k="rank_total" right={false} />
                    <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", textAlign: "left", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>종목</th>
                    <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", textAlign: "left", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>섹터</th>
                    <Th label="종합점수" k="composite_score" />
                    <Th label="모멘텀3M" k="momentum_3m" />
                    <Th label="모멘텀6M" k="momentum_6m" />
                    <Th label="모멘텀12M" k="momentum_12m" />
                    <Th label="상대강도" k="relative_strength_3m" />
                    <Th label="변동성" k="volatility_20d" />
                    <Th label="외국인5d" k="foreign_flow_5d" />
                    <Th label="기관5d" k="institution_flow_5d" />
                    <th style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>팩터Z</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, idx) => {
                    const color = scoreColor(row.composite_score);
                    const isExp = expanded === row.ticker;
                    const rowBg = idx % 2 === 0 ? "#fff" : "#fafafa";
                    return (
                      <>
                        <tr key={row.ticker}
                          onClick={() => setExpanded(isExp ? null : row.ticker)}
                          style={{ cursor: "pointer", background: isExp ? "#f0f7ff" : rowBg, transition: "background 0.1s" }}>
                          <td style={{ padding: "12px 12px", fontSize: 14, color: "var(--text-3)", fontWeight: 600 }}>
                            {row.rank_total}
                          </td>
                          <td style={{ padding: "12px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                              <div>
                                <Link href={`/stock?ticker=${encodeURIComponent(row.ticker)}`}
                                  onClick={e => e.stopPropagation()}
                                  style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", textDecoration: "none" }}>
                                  {row.stock_name}
                                </Link>
                                <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>{row.ticker}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "12px 12px" }}>
                            <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: "var(--bg-2)", color: "var(--text-2)", fontWeight: 500 }}>
                              {row.sector}
                            </span>
                          </td>
                          <td style={{ padding: "12px 12px", textAlign: "right" }}>
                            <span style={{ fontSize: 20, fontWeight: 900, color }}>{row.composite_score.toFixed(0)}</span>
                          </td>
                          <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13, fontWeight: 600, color: (row.momentum_3m ?? 0) >= 0 ? "#00b493" : "#f04452" }}>
                            {pct(row.momentum_3m)}
                          </td>
                          <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13, fontWeight: 600, color: (row.momentum_6m ?? 0) >= 0 ? "#00b493" : "#f04452" }}>
                            {pct(row.momentum_6m)}
                          </td>
                          <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13, fontWeight: 600, color: (row.momentum_12m ?? 0) >= 0 ? "#00b493" : "#f04452" }}>
                            {pct(row.momentum_12m)}
                          </td>
                          <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13, fontWeight: 600, color: (row.relative_strength_3m ?? 0) >= 0 ? "#00b493" : "#f04452" }}>
                            {pct(row.relative_strength_3m)}
                          </td>
                          <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13, color: "var(--text-2)" }}>
                            {row.volatility_20d != null ? `${(row.volatility_20d * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 12, color: (row.foreign_flow_5d ?? 0) >= 0 ? "#00b493" : "#f04452", fontWeight: 600 }}>
                            {flowK(row.foreign_flow_5d)}
                          </td>
                          <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 12, color: (row.institution_flow_5d ?? 0) >= 0 ? "#00b493" : "#f04452", fontWeight: 600 }}>
                            {flowK(row.institution_flow_5d)}
                          </td>
                          <td style={{ padding: "12px 12px", minWidth: 120 }}>
                            <ZBar z={row.z_momentum} />
                          </td>
                        </tr>
                        {isExp && (
                          <tr key={`${row.ticker}-exp`} style={{ background: "#f0f7ff" }}>
                            <td colSpan={12} style={{ padding: "12px 20px" }}>
                              <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                                <div>
                                  <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>팩터 Z-score 상세</p>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {[
                                      ["모멘텀 (40%)", row.z_momentum],
                                      ["상대강도 (25%)", row.z_rs],
                                      ["저변동성 (15%)", row.z_volatility],
                                      ["수급 (20%)", row.z_flow],
                                    ].map(([label, z]) => (
                                      <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span style={{ fontSize: 12, color: "var(--text-2)", width: 110 }}>{label as string}</span>
                                        <ZBar z={z as number | null} />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>수급 상세</p>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    {[
                                      ["외국인 5일", row.foreign_flow_5d],
                                      ["기관 5일", row.institution_flow_5d],
                                    ].map(([l, v]) => (
                                      <div key={l as string} style={{ fontSize: 13, color: (v as number ?? 0) >= 0 ? "#00b493" : "#f04452", fontWeight: 600 }}>
                                        {l as string}: {flowK(v as number | null)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "flex-end" }}>
                                  <Link href={`/stock?ticker=${encodeURIComponent(row.ticker)}`}
                                    style={{ padding: "8px 18px", background: "var(--blue)", color: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                                    차트·진입신호 보기 →
                                  </Link>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
