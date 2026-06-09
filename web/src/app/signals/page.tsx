"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TradeSignal {
  ticker: string;
  stock_name: string;
  sector: string;
  signal: "BUY" | "SELL" | "HOLD";
  composite_score: number;
  tech_score: number | null;
  yt_score: number | null;
  factor_score: number | null;
  news_score: number | null;
  signal_agreement: number | null;
  market_regime: "BULL" | "BEAR" | "NEUTRAL";
  yt_mentions: number;
  yt_sentiment_ratio: number | null;
  key_yt_signals: string[];
  urgency: string | null;
  trading_type: string | null;
  data_quality_score: number | null;
  yt_no_data: boolean;
  calculated_at: string;
  // price fields from stock_prices
  entry_price: number | null;
  open_price: number | null;
  open_change_pct: number | null;
  trade_date: string | null;
}

const SECTORS = [
  "전체", "반도체", "2차전지/에너지", "바이오", "자동차",
  "IT/플랫폼", "금융", "소재/산업재", "조선", "방산",
  "원자력", "건설", "우주항공", "화장품", "로봇", "광통신",
];

function signalBadge(signal: string) {
  const styles: Record<string, { bg: string; color: string }> = {
    BUY:  { bg: "#e6f9f2", color: "#00b493" },
    SELL: { bg: "#fff0f0", color: "#f04452" },
    HOLD: { bg: "#f0f4ff", color: "#3182f6" },
  };
  const s = styles[signal] ?? styles.HOLD;
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontWeight: 700, fontSize: 12, padding: "2px 10px",
      borderRadius: 6, letterSpacing: 0.5,
    }}>
      {signal}
    </span>
  );
}

function regimeBadge(regime: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    BULL:    { label: "BULL 상승", bg: "#e6f9f2", color: "#00b493" },
    BEAR:    { label: "BEAR 하락", bg: "#fff0f0", color: "#f04452" },
    NEUTRAL: { label: "NEUTRAL 중립", bg: "#f5f5f5", color: "#888" },
  };
  const m = map[regime] ?? map.NEUTRAL;
  return (
    <span style={{
      background: m.bg, color: m.color,
      fontWeight: 700, fontSize: 13, padding: "4px 14px",
      borderRadius: 8, letterSpacing: 0.5,
    }}>
      시장 국면: {m.label}
    </span>
  );
}

function ScoreBar({ value, label }: { value: number | null; label: string }) {
  if (value == null) return <span style={{ fontSize: 11, color: "#bbb" }}>—</span>;
  const color = value >= 65 ? "#00b493" : value >= 45 ? "#3182f6" : "#f04452";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 10, color: "#999", minWidth: 32 }}>{label}</span>
      <div style={{ width: 44, height: 5, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{Math.round(value)}</span>
    </div>
  );
}

type SortKey = keyof TradeSignal;

export default function SignalsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TradeSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [sector, setSector] = useState("전체");
  const [signalFilter, setSignalFilter] = useState<"" | "BUY" | "SELL" | "HOLD">("");
  const [sortKey, setSortKey] = useState<SortKey>("composite_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [marketRegime, setMarketRegime] = useState("NEUTRAL");
  const [calculatedAt, setCalculatedAt] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (sector !== "전체") params.set("sector", sector);
    if (signalFilter) params.set("signal", signalFilter);

    fetch(`/api/signals?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.signals ?? []);
        setMarketRegime(d.market_regime ?? "NEUTRAL");
        if (d.calculated_at) {
          setCalculatedAt(
            new Date(d.calculated_at).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
              month: "numeric", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            })
          );
        }
      })
      .finally(() => setLoading(false));
  }, [sector, signalFilter]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey] as number | string | null ?? 0;
      const bv = b[sortKey] as number | string | null ?? 0;
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortTh({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col;
    return (
      <th
        onClick={() => toggleSort(col)}
        style={{ cursor: "pointer", userSelect: "none", padding: "10px 8px",
          background: active ? "#e8f3ff" : "transparent",
          color: active ? "var(--blue)" : "var(--text-2)",
          fontWeight: active ? 700 : 500, fontSize: 12, whiteSpace: "nowrap",
        }}
      >
        {label} {active ? (sortAsc ? "▲" : "▼") : ""}
      </th>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "12px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <p style={{ fontSize: 10, letterSpacing: 3, color: "var(--blue)", fontWeight: 700, margin: 0 }}>KOREA STOCK AI</p>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>매매 신호 센터</h1>
            </Link>
            {calculatedAt && (
              <span style={{ fontSize: 11, color: "#aaa" }}>신호 계산 {calculatedAt}</span>
            )}
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link href="/screener" style={{ padding: "7px 14px", borderRadius: 8, background: "#f5f5f5", color: "var(--text-2)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              퀀트 스크리너
            </Link>
            <Link href="/portfolio" style={{ padding: "7px 14px", borderRadius: 8, background: "#f5f5f5", color: "var(--text-2)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              가상투자
            </Link>
            <Link href="/" style={{ padding: "7px 14px", borderRadius: 8, background: "#f5f5f5", color: "var(--text-2)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              대시보드
            </Link>
          </nav>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
        {/* Market regime banner */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {regimeBadge(marketRegime)}
          <span style={{ fontSize: 12, color: "#999" }}>
            YouTube 전문가 합의 기반 시장 국면 ({NEUTRAL_REENTRY_THRESHOLD * 100}% 히스테리시스)
          </span>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {/* Signal filter */}
          {(["", "BUY", "SELL", "HOLD"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSignalFilter(s)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: "pointer", border: "none",
                background: signalFilter === s
                  ? s === "BUY" ? "#00b493" : s === "SELL" ? "#f04452" : s === "HOLD" ? "#3182f6" : "#222"
                  : "#f0f0f0",
                color: signalFilter === s ? "#fff" : "#555",
              }}
            >
              {s === "" ? "전체 신호" : s}
            </button>
          ))}
          <div style={{ width: 1, background: "#ddd", margin: "0 4px" }} />
          {/* Sector filter */}
          {SECTORS.map((s) => (
            <button
              key={s}
              onClick={() => setSector(s)}
              style={{
                padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                cursor: "pointer", border: "none",
                background: sector === s ? "var(--blue)" : "#f0f0f0",
                color: sector === s ? "#fff" : "#666",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#aaa" }}>신호 로딩 중...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#aaa", background: "#fff", borderRadius: 12 }}>
            <p style={{ marginBottom: 8, fontWeight: 700 }}>아직 신호 데이터가 없습니다</p>
            <code style={{ fontSize: 12, color: "#888" }}>python signal_aggregator.py 실행 필요</code>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <SortTh col="signal" label="신호" />
                    <SortTh col="stock_name" label="종목" />
                    <SortTh col="sector" label="섹터" />
                    <SortTh col="composite_score" label="종합점수" />
                    <th style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>컴포넌트</th>
                    <th style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-2)", fontWeight: 500, whiteSpace: "nowrap" }}>기준가 / 시작가↔</th>
                    <SortTh col="signal_agreement" label="일치도" />
                    <SortTh col="yt_mentions" label="YT언급" />
                    <th style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>상세</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <>
                      <tr
                        key={row.ticker}
                        onClick={() => setExpanded(expanded === row.ticker ? null : row.ticker)}
                        style={{
                          cursor: "pointer", borderBottom: "1px solid var(--border)",
                          background: expanded === row.ticker ? "#f8faff" : "transparent",
                        }}
                      >
                        <td style={{ padding: "10px 8px" }}>{signalBadge(row.signal)}</td>
                        <td
                          style={{ padding: "10px 8px", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}
                          onClick={(e) => { e.stopPropagation(); router.push(`/stock?ticker=${encodeURIComponent(row.ticker)}`); }}
                        >
                          {row.stock_name}
                        </td>
                        <td style={{ padding: "10px 8px", fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>{row.sector}</td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          <span style={{
                            fontSize: 18, fontWeight: 800,
                            color: row.composite_score >= 65 ? "#00b493" : row.composite_score >= 45 ? "#3182f6" : "#f04452",
                          }}>
                            {row.composite_score.toFixed(1)}
                          </span>
                        </td>
                        <td style={{ padding: "10px 8px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <ScoreBar value={row.tech_score} label="기술" />
                            <ScoreBar value={row.yt_score} label="YT" />
                            <ScoreBar value={row.factor_score} label="팩터" />
                            <ScoreBar value={row.news_score} label="뉴스" />
                          </div>
                        </td>
                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                          {row.entry_price ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>
                                {row.entry_price.toLocaleString()}원
                              </span>
                              {row.open_change_pct != null ? (
                                <span style={{
                                  fontSize: 12, fontWeight: 600,
                                  color: row.open_change_pct > 0 ? "#e53935" : row.open_change_pct < 0 ? "#1565c0" : "#888",
                                }}>
                                  {row.open_change_pct > 0 ? "+" : ""}{row.open_change_pct.toFixed(2)}%
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: "#bbb" }}>시가 대기중</span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: "#bbb" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          {row.signal_agreement != null ? (
                            <span style={{
                              fontSize: 13, fontWeight: 700,
                              color: row.signal_agreement >= 70 ? "#00b493" : row.signal_agreement >= 40 ? "#888" : "#f04452",
                            }}>
                              {Math.round(row.signal_agreement)}%
                            </span>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: row.yt_no_data ? "#bbb" : "#3182f6" }}>
                            {row.yt_no_data ? "—" : row.yt_mentions}
                          </span>
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center", fontSize: 14, color: "#aaa" }}>
                          {expanded === row.ticker ? "▲" : "▼"}
                        </td>
                      </tr>

                      {expanded === row.ticker && (
                        <tr key={`${row.ticker}-detail`}>
                          <td colSpan={9} style={{ padding: "12px 16px", background: "#f8faff", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                              {/* Meta */}
                              <div>
                                <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>신호 메타</p>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {row.urgency && (
                                    <span style={{ fontSize: 12, background: "#e8f3ff", color: "var(--blue)", padding: "2px 8px", borderRadius: 5, fontWeight: 600 }}>
                                      {row.urgency}
                                    </span>
                                  )}
                                  {row.trading_type && (
                                    <span style={{ fontSize: 12, background: "#f0f0f0", color: "#555", padding: "2px 8px", borderRadius: 5, fontWeight: 600 }}>
                                      {row.trading_type}
                                    </span>
                                  )}
                                  {row.yt_sentiment_ratio != null && (
                                    <span style={{ fontSize: 12, color: "#888" }}>
                                      YT 긍정 {Math.round(row.yt_sentiment_ratio * 100)}%
                                    </span>
                                  )}
                                  {row.data_quality_score != null && (
                                    <span style={{ fontSize: 12, color: "#bbb" }}>
                                      데이터품질 {Math.round(row.data_quality_score * 100)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* YT signals */}
                              <div>
                                <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>YouTube 전문가 언급</p>
                                {row.key_yt_signals && row.key_yt_signals.length > 0 ? (
                                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                                    {row.key_yt_signals.map((sig, i) => (
                                      <li key={i} style={{ fontSize: 12, color: "#555", marginBottom: 3 }}>{sig}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span style={{ fontSize: 12, color: "#bbb" }}>최근 7일 유튜브 언급 없음</span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", fontSize: 12, color: "#aaa" }}>
              총 {rows.length}개 종목 · BUY {rows.filter(r => r.signal === "BUY").length} · SELL {rows.filter(r => r.signal === "SELL").length} · HOLD {rows.filter(r => r.signal === "HOLD").length}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

const NEUTRAL_REENTRY_THRESHOLD = 0.45;
