"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
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
  entry_price: number | null;
  open_price: number | null;
  open_change_pct: number | null;
  trade_date: string | null;
  sniper_match: boolean;
  execution_signal: string | null;
  execution_reason: string | null;
  market_risk_level: string | null;
  market_risk_score: number | null;
  market_risk_reasons: string[] | null;
  suggested_position_pct: number | null;
  take_profit_pct: number | null;
  stop_loss_pct: number | null;
  max_holding_days: number | null;
  trade_type: "SNIPER" | "SWING" | "LONG_TERM" | "WATCH" | null;
  data_freshness_score: number | null;
  stale_components: string[] | null;
}

interface SniperSummary {
  period: string;
  active: boolean;
  daysLeft: number;
  realized_pnl: number;
  trades: number;
  win_rate: number | null;
  open_count: number;
}

interface SniperPosition {
  id: number;
  stock_name: string;
  stock_code: string;
  entry_date: string;
  entry_price: number;
  shares: number;
  cost: number;
  signal_score: number;
  news_score: number;
  yt_score: number;
  status: string;
  max_price: number | null;
  exit_label: string | null;
}

interface SniperSignal {
  ticker: string;
  stock_name: string;
  sector: string;
  composite_score: number;
  tech_score: number | null;
  yt_score: number | null;
  news_score: number | null;
  factor_score: number | null;
  has_catalyst: boolean;
  news_today: { sentiment: string; trading_signal: string; news_impact_score: number } | null;
  entry_price: number | null;
  open_price: number | null;
  open_change_pct: number | null;
  trade_date: string | null;
}

interface HistoryItem {
  id: number;
  stock_name: string;
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  shares: number;
  pnl_pct: number;
  pnl_amount: number;
  exit_reason: string;
}

interface DailyPnL {
  date: string;
  daily_pnl: number;
  cumulative_pnl: number;
  cumulative_pct: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SECTORS = [
  "전체", "반도체", "2차전지/에너지", "바이오", "자동차",
  "IT/플랫폼", "금융", "소재/산업재", "조선", "방산",
  "원자력", "건설", "우주항공", "화장품", "로봇", "광통신",
];
const BUDGET = 2_000_000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMoney(n: number) {
  const abs = Math.abs(n);
  if (abs >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

function fmtDate(s: string) {
  if (!s) return "-";
  return s.replace(/-/g, ".").slice(2);
}

function signalBadge(signal: string) {
  const styles: Record<string, { bg: string; color: string }> = {
    BUY:  { bg: "#e6f9f2", color: "#00b493" },
    SELL: { bg: "#fff0f0", color: "#f04452" },
    HOLD: { bg: "#f0f4ff", color: "#3182f6" },
  };
  const s = styles[signal] ?? styles.HOLD;
  return (
    <span style={{ background: s.bg, color: s.color, fontWeight: 700, fontSize: 12, padding: "2px 10px", borderRadius: 6, letterSpacing: 0.5 }}>
      {signal}
    </span>
  );
}

function sniperBadge() {
  return (
    <span style={{ background: "linear-gradient(90deg, #ff6b35, #f7c59f)", color: "#fff", fontWeight: 800, fontSize: 11, padding: "2px 8px", borderRadius: 6, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
      🎯 스나이퍼
    </span>
  );
}

function tradeTypeBadge(type: string | null) {
  if (!type || type === "WATCH") return null;
  const map: Record<string, { label: string; bg: string; color: string }> = {
    SNIPER:    { label: "⚡ 스나이퍼",  bg: "#fef2f2", color: "#c81e1e" },
    SWING:     { label: "🔄 스윙",      bg: "#eff6ff", color: "#1d4ed8" },
    LONG_TERM: { label: "🏦 장기",      bg: "#f0fdf4", color: "#166534" },
  };
  const m = map[type];
  if (!m) return null;
  return (
    <span style={{ background: m.bg, color: m.color, fontWeight: 700, fontSize: 10, padding: "1px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}

function executionBadge(signal: string | null) {
  if (!signal) return null;
  const map: Record<string, { label: string; bg: string; color: string }> = {
    BUY_OK:    { label: "✅ BUY OK",   bg: "#e6f9f2", color: "#00b493" },
    BUY_SMALL: { label: "⚠️ 소액매수",  bg: "#fff8e6", color: "#d97706" },
    WATCH:     { label: "👁 대기",      bg: "#eff6ff", color: "#3182f6" },
    BLOCKED:   { label: "⛔ 금지",      bg: "#fff0f0", color: "#f04452" },
    HOLD:      { label: "HOLD",        bg: "#f5f5f5", color: "#888" },
    REDUCE:    { label: "📉 축소",      bg: "#fff0f0", color: "#f04452" },
  };
  const m = map[signal] ?? { label: signal, bg: "#f5f5f5", color: "#888" };
  return (
    <span style={{ background: m.bg, color: m.color, fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}

function riskLevelBadge(level: string | null, score: number | null, reasons: string[] | null) {
  if (!level) return null;
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    LOW:     { label: "✅ 시장위험 낮음",    bg: "#e6f9f2", color: "#00b493", border: "#00b493" },
    MEDIUM:  { label: "⚠️ 시장위험 보통",   bg: "#fff8e6", color: "#d97706", border: "#f5a623" },
    HIGH:    { label: "🔴 시장위험 높음",   bg: "#fff0f0", color: "#f04452", border: "#f04452" },
    EXTREME: { label: "⛔ 시장위험 매우높음", bg: "#fff0f0", color: "#c0392b", border: "#c0392b" },
  };
  const m = map[level] ?? { label: level, bg: "#f5f5f5", color: "#888", border: "#ccc" };
  return (
    <div style={{ background: m.bg, border: `1px solid ${m.border}20`, borderLeft: `3px solid ${m.border}`, borderRadius: 8, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ color: m.color, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}>
        {m.label} ({score?.toFixed(0)}/100)
      </span>
      {(reasons ?? []).slice(0, 3).map((r, i) => (
        <span key={i} style={{ fontSize: 11, color: m.color, opacity: 0.8 }}>· {r}</span>
      ))}
    </div>
  );
}

function regimeBadge(regime: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    STRONG_BULL: { label: "STRONG BULL ▲▲", bg: "#d1fae5", color: "#065f46" },
    BULL:        { label: "BULL 상승 ▲",     bg: "#e6f9f2", color: "#00b493" },
    NEUTRAL:     { label: "NEUTRAL 중립",    bg: "#f5f5f5", color: "#888" },
    BEAR:        { label: "BEAR 하락 ▼",     bg: "#fff0f0", color: "#f04452" },
    STRONG_BEAR: { label: "STRONG BEAR ▼▼", bg: "#fee2e2", color: "#991b1b" },
  };
  const m = map[regime] ?? map.NEUTRAL;
  return (
    <span style={{ background: m.bg, color: m.color, fontWeight: 700, fontSize: 13, padding: "4px 14px", borderRadius: 8, letterSpacing: 0.5 }}>
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

function PnlBadge({ pct, amt }: { pct?: number | null; amt?: number | null }) {
  const p = pct ?? 0;
  const color = p > 0 ? "#f04452" : p < 0 ? "#3182f6" : "#8b95a1";
  return (
    <span style={{ color, fontWeight: 700 }}>
      {p >= 0 ? "+" : ""}{p.toFixed(2)}%
      {amt != null && <span style={{ fontSize: 11, marginLeft: 4 }}>({p >= 0 ? "+" : ""}{fmtMoney(amt)}원)</span>}
    </span>
  );
}

function DailyChart({ daily }: { daily: DailyPnL[] }) {
  if (!daily.length) return <p style={{ color: "#b0b8c1", fontSize: 13, padding: "20px 0" }}>아직 청산 내역 없음</p>;
  return (
    <div>
      <p style={{ fontSize: 12, color: "#8b95a1", marginBottom: 8 }}>누적 수익률</p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60, marginBottom: 16 }}>
        {daily.map((d, i) => {
          const pct = d.cumulative_pct;
          const color = pct >= 0 ? "#f04452" : "#3182f6";
          const h = Math.abs(pct) * 4 + 4;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: 9, color, fontWeight: 700 }}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
              <div style={{ width: "100%", height: `${Math.min(h, 40)}px`, background: color, borderRadius: 3, opacity: 0.85 }} />
              <span style={{ fontSize: 9, color: "#b0b8c1" }}>{fmtDate(d.date)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#8b95a1", marginBottom: 6, padding: "0 2px" }}>
          <span>날짜</span><span>당일 손익</span><span>누적</span>
        </div>
        {[...daily].reverse().map((d, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 2px", borderBottom: "1px solid #f2f4f6" }}>
            <span style={{ color: "#191919" }}>{fmtDate(d.date)}</span>
            <PnlBadge pct={d.daily_pnl / BUDGET * 100} amt={d.daily_pnl} />
            <span style={{ color: d.cumulative_pct >= 0 ? "#f04452" : "#3182f6", fontWeight: 600 }}>
              {d.cumulative_pct >= 0 ? "+" : ""}{d.cumulative_pct.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SignalsPage() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<"signals" | "sniper">("signals");

  // ── Signals state ──────────────────────────────────────────────────────────
  const [rows, setRows] = useState<TradeSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [sector, setSector] = useState("전체");
  const [signalFilter, setSignalFilter] = useState<"" | "BUY" | "SELL" | "HOLD">("");
  const [sortKey, setSortKey] = useState<keyof TradeSignal>("composite_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [marketRegime, setMarketRegime] = useState("NEUTRAL");
  const [calculatedAt, setCalculatedAt] = useState("");
  const [marketRiskLevel, setMarketRiskLevel] = useState<string | null>(null);
  const [marketRiskScore, setMarketRiskScore] = useState<number | null>(null);
  const [marketRiskReasons, setMarketRiskReasons] = useState<string[] | null>(null);

  // ── Sniper state ───────────────────────────────────────────────────────────
  const [sniperTab, setSniperTab] = useState<"positions" | "signals" | "history" | "daily">("positions");
  const [summary, setSummary] = useState<SniperSummary | null>(null);
  const [positions, setPositions] = useState<SniperPosition[]>([]);
  const [sniperSignals, setSniperSignals] = useState<SniperSignal[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [daily, setDaily] = useState<DailyPnL[]>([]);
  const [sniperLoading, setSniperLoading] = useState(false);

  // Read ?tab=sniper from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "sniper") setMainTab("sniper");
  }, []);

  // ── Signals fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mainTab !== "signals") return;
    setLoading(true);
    const params = new URLSearchParams();
    if (sector !== "전체") params.set("sector", sector);
    if (signalFilter) params.set("signal", signalFilter);
    fetch(`/api/signals?${params}`)
      .then(r => r.json())
      .then(d => {
        const signals = d.signals ?? [];
        setRows(signals);
        setMarketRegime(d.market_regime ?? "NEUTRAL");
        if (d.calculated_at) {
          setCalculatedAt(new Date(d.calculated_at).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
          }));
        }
        const first = signals[0] as TradeSignal | undefined;
        if (first?.market_risk_level) {
          setMarketRiskLevel(first.market_risk_level);
          setMarketRiskScore(first.market_risk_score ?? null);
          setMarketRiskReasons(first.market_risk_reasons ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, [mainTab, sector, signalFilter]);

  // ── Sniper fetch ───────────────────────────────────────────────────────────
  const loadSniper = useCallback(async (t: string) => {
    setSniperLoading(true);
    try {
      const res = await fetch(`/api/sniper?tab=${t}`);
      const d = await res.json();
      setSummary(d.summary);
      if (t === "positions") setPositions(d.positions ?? []);
      if (t === "signals")   setSniperSignals(d.signals ?? []);
      if (t === "history")   setHistory(d.history ?? []);
      if (t === "daily")     setDaily(d.daily ?? []);
    } finally {
      setSniperLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mainTab === "sniper") loadSniper(sniperTab);
  }, [mainTab, sniperTab, loadSniper]);

  // ── Sort ───────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = (a[sortKey] as number | string | null) ?? 0;
      const bv = (b[sortKey] as number | string | null) ?? 0;
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortAsc]);

  function toggleSort(key: keyof TradeSignal) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortTh({ col, label }: { col: keyof TradeSignal; label: string }) {
    const active = sortKey === col;
    return (
      <th onClick={() => toggleSort(col)}
        style={{ cursor: "pointer", userSelect: "none", padding: "10px 8px",
          background: active ? "#e8f3ff" : "transparent",
          color: active ? "var(--blue)" : "var(--text-2)",
          fontWeight: active ? 700 : 500, fontSize: 12, whiteSpace: "nowrap" }}>
        {label} {active ? (sortAsc ? "▲" : "▼") : ""}
      </th>
    );
  }

  const buyCount = rows.filter(r => r.signal === "BUY").length;

  // Sector concentration: count BUY_OK per sector
  const sectorBuyOk = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.filter(r => r.execution_signal === "BUY_OK").forEach(r => {
      counts[r.sector] = (counts[r.sector] ?? 0) + 1;
    });
    return Object.entries(counts).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "12px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <p style={{ fontSize: 10, letterSpacing: 3, color: "var(--blue)", fontWeight: 700, margin: 0 }}>KOREA STOCK AI</p>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>신호 센터</h1>
            </Link>
            {mainTab === "signals" && calculatedAt && (
              <span style={{ fontSize: 11, color: "#aaa" }}>신호 계산 {calculatedAt}</span>
            )}
            {mainTab === "sniper" && summary && (
              <p style={{ fontSize: 12, color: "#8b95a1", margin: 0 }}>
                {summary.period}
                {summary.active
                  ? <span style={{ marginLeft: 8, color: "#00b493", fontWeight: 600 }}>● 활성 ({summary.daysLeft}일 남음)</span>
                  : <span style={{ marginLeft: 8, color: "#b0b8c1" }}>● 대기 중</span>}
              </p>
            )}
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link href="/screener" style={{ padding: "7px 14px", borderRadius: 8, background: "#f5f5f5", color: "var(--text-2)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>퀀트 스크리너</Link>
            <Link href="/portfolio" style={{ padding: "7px 14px", borderRadius: 8, background: "#f5f5f5", color: "var(--text-2)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>가상투자</Link>
            <Link href="/" style={{ padding: "7px 14px", borderRadius: 8, background: "#f5f5f5", color: "var(--text-2)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>대시보드</Link>
          </nav>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── Main tabs ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid var(--border)" }}>
          {([
            { id: "signals" as const, label: "📡 전체 신호", sub: `${rows.length}개 종목` },
            { id: "sniper"  as const, label: "⚡ 스나이퍼",  sub: summary ? `미결 ${summary.open_count}개 · BUY ${buyCount}` : "단타 전략" },
          ]).map(t => (
            <button key={t.id} onClick={() => setMainTab(t.id)}
              style={{
                padding: "10px 24px", border: "none", cursor: "pointer", background: "transparent",
                borderBottom: mainTab === t.id ? "2px solid var(--blue)" : "2px solid transparent",
                marginBottom: -2,
                color: mainTab === t.id ? "var(--blue)" : "var(--text-2)",
                fontWeight: mainTab === t.id ? 700 : 500,
                fontSize: 15, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
              }}>
              {t.label}
              <span style={{ fontSize: 11, color: "#aaa", fontWeight: 400 }}>{t.sub}</span>
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SIGNALS TAB
           ══════════════════════════════════════════════════════════════════ */}
        {mainTab === "signals" && (
          <>
            <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {regimeBadge(marketRegime)}
                <span style={{ fontSize: 12, color: "#999" }}>YouTube 전문가 합의 기반 시장 국면</span>
              </div>
              {riskLevelBadge(marketRiskLevel, marketRiskScore, marketRiskReasons)}
              {sectorBuyOk.length > 0 && (
                <div style={{ background: "#fff8e6", border: "1px solid #f5a623", borderLeft: "3px solid #f5a623", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#92400e" }}>
                  ⚠️ 섹터 쏠림 주의: {sectorBuyOk.map(([s, n]) => `${s} BUY_OK ${n}개`).join(" · ")} — 한 섹터에 집중 매수 위험
                </div>
              )}
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {(["", "BUY", "SELL", "HOLD"] as const).map(s => (
                <button key={s} onClick={() => setSignalFilter(s)}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: "pointer", border: "none",
                    background: signalFilter === s
                      ? s === "BUY" ? "#00b493" : s === "SELL" ? "#f04452" : s === "HOLD" ? "#3182f6" : "#222"
                      : "#f0f0f0",
                    color: signalFilter === s ? "#fff" : "#555",
                  }}>
                  {s === "" ? "전체 신호" : s}
                </button>
              ))}
              <div style={{ width: 1, background: "#ddd", margin: "0 4px" }} />
              {SECTORS.map(s => (
                <button key={s} onClick={() => setSector(s)}
                  style={{
                    padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", border: "none",
                    background: sector === s ? "var(--blue)" : "#f0f0f0",
                    color: sector === s ? "#fff" : "#666",
                  }}>
                  {s}
                </button>
              ))}
            </div>

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
                        <th style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-2)", fontWeight: 500, whiteSpace: "nowrap" }}>실행신호</th>
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
                      {sorted.map(row => (
                        <>
                          <tr key={row.ticker}
                            onClick={() => setExpanded(expanded === row.ticker ? null : row.ticker)}
                            style={{ cursor: "pointer", borderBottom: "1px solid var(--border)", background: expanded === row.ticker ? "#f8faff" : "transparent" }}>
                            <td style={{ padding: "10px 8px" }}>{signalBadge(row.signal)}</td>
                            <td style={{ padding: "10px 8px" }}>{executionBadge(row.execution_signal)}</td>
                            <td style={{ padding: "10px 8px", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}
                              onClick={e => { e.stopPropagation(); router.push(`/stock?ticker=${encodeURIComponent(row.ticker)}`); }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                {row.stock_name}
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {row.sniper_match && sniperBadge()}
                                  {tradeTypeBadge(row.trade_type)}
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: "10px 8px", fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>{row.sector}</td>
                            <td style={{ padding: "10px 8px", textAlign: "center" }}>
                              <span style={{ fontSize: 18, fontWeight: 800, color: row.composite_score >= 65 ? "#00b493" : row.composite_score >= 45 ? "#3182f6" : "#f04452" }}>
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
                                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{row.entry_price.toLocaleString()}원</span>
                                  {row.open_change_pct != null ? (
                                    <span style={{ fontSize: 12, fontWeight: 600, color: row.open_change_pct > 0 ? "#e53935" : row.open_change_pct < 0 ? "#1565c0" : "#888" }}>
                                      {row.open_change_pct > 0 ? "+" : ""}{row.open_change_pct.toFixed(2)}%
                                    </span>
                                  ) : <span style={{ fontSize: 11, color: "#bbb" }}>시가 대기중</span>}
                                </div>
                              ) : <span style={{ fontSize: 11, color: "#bbb" }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 8px", textAlign: "center" }}>
                              {row.signal_agreement != null ? (
                                <span style={{ fontSize: 13, fontWeight: 700, color: row.signal_agreement >= 70 ? "#00b493" : row.signal_agreement >= 40 ? "#888" : "#f04452" }}>
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
                              <td colSpan={10} style={{ padding: "14px 18px", background: "#f8faff", borderBottom: "1px solid var(--border)" }}>
                                {/* 실행 판단 */}
                                {row.execution_reason && (
                                  <div style={{ marginBottom: 12, padding: "9px 14px", background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12, color: "#444", display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <span style={{ fontWeight: 700, color: "#555", whiteSpace: "nowrap" }}>실행 판단</span>
                                    <span>{row.execution_reason}</span>
                                  </div>
                                )}

                                {/* 포지션 설정 */}
                                {(row.take_profit_pct || row.stop_loss_pct) && (
                                  <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    {row.suggested_position_pct && (
                                      <div style={{ padding: "6px 14px", background: "#eff6ff", borderRadius: 8, fontSize: 12, color: "#1d4ed8", fontWeight: 700, border: "1px solid #bfdbfe" }}>
                                        💰 비중 {row.suggested_position_pct}%
                                      </div>
                                    )}
                                    {row.take_profit_pct && row.entry_price && (
                                      <div style={{ padding: "6px 14px", background: "#f0fdf4", borderRadius: 8, fontSize: 12, color: "#15803d", fontWeight: 700, border: "1px solid #bbf7d0" }}>
                                        ↑ 익절 +{row.take_profit_pct}%&nbsp;
                                        <span style={{ fontWeight: 400, opacity: 0.8 }}>({Math.round(row.entry_price * (1 + row.take_profit_pct / 100)).toLocaleString()}원)</span>
                                      </div>
                                    )}
                                    {row.stop_loss_pct && row.entry_price && (
                                      <div style={{ padding: "6px 14px", background: "#fef2f2", borderRadius: 8, fontSize: 12, color: "#b91c1c", fontWeight: 700, border: "1px solid #fecaca" }}>
                                        ↓ 손절 -{row.stop_loss_pct}%&nbsp;
                                        <span style={{ fontWeight: 400, opacity: 0.8 }}>({Math.round(row.entry_price * (1 - row.stop_loss_pct / 100)).toLocaleString()}원)</span>
                                      </div>
                                    )}
                                    {row.max_holding_days && (
                                      <div style={{ padding: "6px 14px", background: "#f5f5f5", borderRadius: 8, fontSize: 12, color: "#555", border: "1px solid #e5e5e5" }}>
                                        ⏰ 최대 {row.max_holding_days}일
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                  {/* 신호 분석 */}
                                  <div>
                                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#aaa", letterSpacing: 1, textTransform: "uppercase" }}>신호 분석</p>
                                    {/* trade_type + urgency */}
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                                      {row.trade_type && row.trade_type !== "WATCH" && tradeTypeBadge(row.trade_type)}
                                      {row.urgency && (
                                        <span style={{ fontSize: 12, background: "#eff6ff", color: "#1d4ed8", padding: "3px 8px", borderRadius: 5, fontWeight: 600 }}>
                                          🕐 {row.urgency}
                                        </span>
                                      )}
                                      {row.trading_type && (
                                        <span style={{ fontSize: 12, background: "#f3f4f6", color: "#4b5563", padding: "3px 8px", borderRadius: 5, fontWeight: 500 }}>
                                          {row.trading_type}
                                        </span>
                                      )}
                                    </div>
                                    {/* 통계 */}
                                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                                      {row.yt_sentiment_ratio != null && (
                                        <span>📺 YT 긍정 <b style={{ color: "#374151" }}>{Math.round(row.yt_sentiment_ratio * 100)}%</b></span>
                                      )}
                                      {row.data_freshness_score != null && (
                                        <span>
                                          신선도{" "}
                                          <b style={{ color: row.data_freshness_score >= 80 ? "#15803d" : row.data_freshness_score >= 50 ? "#b45309" : "#b91c1c" }}>
                                            {row.data_freshness_score}점
                                          </b>
                                        </span>
                                      )}
                                    </div>
                                    {/* 데이터 누락 경고 */}
                                    {row.stale_components && row.stale_components.length > 0 && (
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                        {row.stale_components.map((c, i) => (
                                          <span key={i} style={{ fontSize: 11, background: "#fef9c3", color: "#854d0e", padding: "2px 7px", borderRadius: 4, border: "1px solid #fde68a" }}>
                                            ⚠ {c}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* YouTube 전문가 */}
                                  <div>
                                    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#aaa", letterSpacing: 1, textTransform: "uppercase" }}>YouTube 전문가 언급</p>
                                    {row.key_yt_signals && row.key_yt_signals.length > 0 ? (
                                      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                                        {row.key_yt_signals.map((sig, i) => (
                                          <li key={i} style={{ fontSize: 12, color: "#374151", padding: "5px 10px", background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                                            {sig}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <span style={{ fontSize: 12, color: "#9ca3af" }}>최근 7일 유튜브 언급 없음</span>
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
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SNIPER TAB
           ══════════════════════════════════════════════════════════════════ */}
        {mainTab === "sniper" && (
          <div>
            {/* Summary cards */}
            {summary && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "실현 손익", value: `${summary.realized_pnl >= 0 ? "+" : ""}${fmtMoney(summary.realized_pnl)}원`, color: summary.realized_pnl >= 0 ? "#f04452" : "#3182f6" },
                  { label: "수익률", value: `${(summary.realized_pnl / BUDGET * 100 >= 0 ? "+" : "")}${(summary.realized_pnl / BUDGET * 100).toFixed(1)}%`, color: summary.realized_pnl >= 0 ? "#f04452" : "#3182f6" },
                  { label: "거래 / 승률", value: summary.trades ? `${summary.trades}회 / ${summary.win_rate}%` : "0회", color: "#191919" },
                  { label: "미결 포지션", value: `${summary.open_count}개`, color: "#3182f6" },
                ].map((c, i) => (
                  <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", border: "1px solid var(--border)" }}>
                    <p style={{ fontSize: 11, color: "#8b95a1", marginBottom: 6 }}>{c.label}</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: c.color, letterSpacing: -0.5 }}>{c.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Sniper sub-tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {([
                { id: "positions" as const, label: "📊 현재 포지션" },
                { id: "signals"   as const, label: "📡 오늘 신호" },
                { id: "daily"     as const, label: "📈 수익률" },
                { id: "history"   as const, label: "📋 거래 내역" },
              ]).map(t => (
                <button key={t.id} onClick={() => setSniperTab(t.id)}
                  style={{
                    padding: "9px 16px", borderRadius: 12, border: "none", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", whiteSpace: "nowrap",
                    background: sniperTab === t.id ? "#191919" : "#fff",
                    color: sniperTab === t.id ? "#fff" : "#8b95a1",
                    boxShadow: sniperTab === t.id ? "0 2px 8px rgba(0,0,0,0.15)" : "0 1px 3px rgba(0,0,0,0.08)",
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {sniperLoading && <p style={{ textAlign: "center", color: "#b0b8c1", padding: 40 }}>로딩 중...</p>}

            {/* 포지션 탭 */}
            {!sniperLoading && sniperTab === "positions" && (
              <div>
                {!summary?.active && (
                  <div style={{ background: "#fff8e6", borderRadius: 14, padding: "16px 20px", marginBottom: 12, border: "1px solid #fde68a" }}>
                    <p style={{ fontSize: 14, color: "#92400e", fontWeight: 600 }}>⏰ 스나이퍼 기간이 아닙니다</p>
                    <p style={{ fontSize: 13, color: "#b45309", marginTop: 4 }}>매달 25일부터 다음달 10일 사이에만 전략이 활성화됩니다.</p>
                  </div>
                )}
                {positions.length === 0 ? (
                  <div style={{ background: "#fff", borderRadius: 14, padding: "32px 20px", textAlign: "center", border: "1px solid var(--border)" }}>
                    <p style={{ color: "#b0b8c1", fontSize: 15 }}>현재 보유 포지션 없음</p>
                    <p style={{ color: "#b0b8c1", fontSize: 13, marginTop: 6 }}>신호 탭에서 오늘의 진입 후보를 확인하세요</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {positions.map(pos => {
                      const holdDays = Math.floor((Date.now() - new Date(pos.entry_date).getTime()) / 86400000);
                      const label = pos.exit_label ?? "🟢 보유";
                      const isSell = ["🔴", "🛑", "📉", "📰", "⏰"].some(e => label.includes(e));
                      const isWatch = label.includes("⚠️");
                      return (
                        <div key={pos.id} style={{
                          background: isSell ? "#fff5f5" : isWatch ? "#fffbeb" : "#fff",
                          borderRadius: 14, padding: "18px 20px",
                          border: isSell ? "2px solid #f04452" : isWatch ? "2px solid #f5a623" : "1.5px solid var(--border)",
                        }}>
                          {isSell && (
                            <div style={{ background: "#f04452", borderRadius: 8, padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{label}</span>
                              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>— 매도를 검토하세요</span>
                            </div>
                          )}
                          {isWatch && !isSell && (
                            <div style={{ background: "#f5a623", borderRadius: 8, padding: "6px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{label}</span>
                              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>— 모니터링 필요</span>
                            </div>
                          )}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                            <div>
                              <span style={{ fontSize: 16, fontWeight: 700, color: "#191919" }}>{pos.stock_name}</span>
                              <span style={{ fontSize: 12, color: "#b0b8c1", marginLeft: 8 }}>{pos.stock_code}</span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#8b95a1", background: "#f2f4f6", padding: "3px 8px", borderRadius: 6 }}>D+{holdDays}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, fontSize: 13, marginBottom: 10 }}>
                            <div><p style={{ color: "#8b95a1", fontSize: 11 }}>진입가</p><p style={{ fontWeight: 700 }}>{pos.entry_price.toLocaleString()}원</p></div>
                            <div><p style={{ color: "#8b95a1", fontSize: 11 }}>보유 수량</p><p style={{ fontWeight: 700 }}>{pos.shares}주</p></div>
                            <div><p style={{ color: "#8b95a1", fontSize: 11 }}>투자금</p><p style={{ fontWeight: 700 }}>{fmtMoney(pos.cost)}원</p></div>
                          </div>
                          <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.04)", borderRadius: 10, fontSize: 12, color: "#8b95a1", display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                            <span>익절: <b style={{ color: "#f04452" }}>+7% ({Math.round(pos.entry_price * 1.07).toLocaleString()}원)</b></span>
                            <span>손절: <b style={{ color: "#3182f6" }}>-5% ({Math.round(pos.entry_price * 0.95).toLocaleString()}원)</b></span>
                            {pos.max_price && pos.max_price > pos.entry_price * 1.05 && (
                              <span>트레일링: <b style={{ color: "#f5a623" }}>{Math.round(pos.max_price * 0.96).toLocaleString()}원</b></span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ flex: 1, background: "#f0fdf4", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#057a55" }}>📰 뉴스 {(pos.news_score * 100).toFixed(0)}점</div>
                            <div style={{ flex: 1, background: "#eff6ff", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#1a56db" }}>📺 유튜브 {(pos.yt_score * 100).toFixed(0)}점</div>
                            <div style={{ flex: 1, background: "#fdf4ff", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#7e22ce" }}>⚡ 종합 {(pos.signal_score * 100).toFixed(0)}점</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 오늘 신호 탭 */}
            {!sniperLoading && sniperTab === "signals" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: "#fff8e6", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#92400e" }}>
                  💡 BUY 등급 + 오늘 호재 뉴스 또는 유튜브 언급 종목 우선 · 촉매 있어야 진입
                </div>
                {sniperSignals.length === 0 ? (
                  <div style={{ background: "#fff", borderRadius: 14, padding: "32px", textAlign: "center", color: "#b0b8c1", border: "1px solid var(--border)" }}>오늘 진입 신호 없음</div>
                ) : (
                  sniperSignals.map((s, i) => (
                    <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", border: "1px solid var(--border)", borderLeft: s.has_catalyst ? "4px solid #f04452" : "4px solid #e5e7eb" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: "#191919" }}>{s.stock_name}</span>
                          {s.has_catalyst && <span style={{ fontSize: 11, background: "#fef2f2", color: "#c81e1e", padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>🔥 촉매</span>}
                          <span style={{ fontSize: 11, color: "#b0b8c1" }}>{s.sector}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#f04452" }}>{s.composite_score.toFixed(1)}</span>
                          {s.entry_price && (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginTop: 2 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#191919" }}>{s.entry_price.toLocaleString()}원</span>
                              {s.open_change_pct != null ? (
                                <span style={{ fontSize: 11, fontWeight: 600, color: s.open_change_pct > 0 ? "#f04452" : s.open_change_pct < 0 ? "#3182f6" : "#8b95a1" }}>
                                  {s.open_change_pct > 0 ? "+" : ""}{s.open_change_pct.toFixed(2)}%
                                </span>
                              ) : <span style={{ fontSize: 11, color: "#b0b8c1" }}>시가 대기중</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      {s.news_today && (
                        <div style={{ fontSize: 12, color: "#057a55", background: "#f0fdf4", padding: "6px 10px", borderRadius: 8, marginBottom: 8 }}>
                          📰 {s.news_today.sentiment} · {s.news_today.trading_signal} · 영향도 {s.news_today.news_impact_score}점
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#8b95a1" }}>
                        <span>기술 {(s.tech_score ?? 50).toFixed(0)}</span>
                        <span>·</span><span>유튜브 {(s.yt_score ?? 50).toFixed(0)}</span>
                        <span>·</span><span>뉴스 {(s.news_score ?? 50).toFixed(0)}</span>
                        <span>·</span><span>팩터 {(s.factor_score ?? 50).toFixed(0)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 수익률 탭 */}
            {!sniperLoading && sniperTab === "daily" && (
              <div style={{ background: "#fff", borderRadius: 14, padding: "20px", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#191919" }}>일별 수익률 추적</p>
                  {summary && (
                    <p style={{ fontSize: 13, color: summary.realized_pnl >= 0 ? "#f04452" : "#3182f6", fontWeight: 700 }}>
                      누적 {summary.realized_pnl >= 0 ? "+" : ""}{(summary.realized_pnl / BUDGET * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <DailyChart daily={daily} />
              </div>
            )}

            {/* 거래 내역 탭 */}
            {!sniperLoading && sniperTab === "history" && (
              <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
                {history.length === 0 ? (
                  <div style={{ padding: "32px", textAlign: "center", color: "#b0b8c1" }}>이번 기간 청산 내역 없음</div>
                ) : (
                  history.map((h, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < history.length - 1 ? "1px solid #f2f4f6" : "none" }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#191919" }}>{h.stock_name}</p>
                        <p style={{ fontSize: 12, color: "#b0b8c1" }}>{fmtDate(h.entry_date)} 진입 → {fmtDate(h.exit_date)} 청산 · {h.exit_reason}</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <PnlBadge pct={h.pnl_pct} amt={h.pnl_amount} />
                        <p style={{ fontSize: 11, color: "#b0b8c1", marginTop: 2 }}>{h.entry_price?.toLocaleString()} → {h.exit_price?.toLocaleString()}원</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
