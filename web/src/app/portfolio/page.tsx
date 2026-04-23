"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────
interface Holding {
  ticker: string; name: string; sector: string;
  shares: number; avgPrice: number; currentPrice: number;
  pnl: number; pnlPct: number;
}

interface Trade {
  date: string; ticker: string; name: string;
  action: "BUY" | "SELL";
  price: number; shares: number; amount: number;
  techReason: string; aiReason: string;
}

interface DailyValue { date: string; value: number; benchmark: number }

interface StrategyResult {
  id: string; label: string; desc: string;
  currentValue: number; totalReturn: number; totalReturnPct: number;
  holdings: Holding[]; dailyValues: DailyValue[]; trades: Trade[];
}

interface PortfolioData {
  startDate: string; startCapital: number;
  benchmark: { returnPct: number };
  strategies: StrategyResult[];
}

// ── Helpers ───────────────────────────────────────────────────
function fmt(n: number) {
  if (Math.abs(n) >= 100_000_000) return (n / 100_000_000).toFixed(2) + "억";
  if (Math.abs(n) >= 10_000) return (n / 10_000).toFixed(0) + "만";
  return n.toLocaleString();
}

function ReturnBadge({ pct, prefix = true }: { pct: number; prefix?: boolean }) {
  const c = pct >= 0 ? "#f04452" : "#3182f6";
  return <span style={{ color: c, fontWeight: 700 }}>{prefix && pct >= 0 ? "+" : ""}{pct}%</span>;
}

// ── Mini chart ────────────────────────────────────────────────
function MiniChart({ dailyValues, strategies }: { dailyValues: DailyValue[]; strategies: StrategyResult[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const COLORS = ["#f04452", "#3182f6", "#00b493"];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dailyValues.length < 2) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);

    // Collect all values for scale
    const allVals: number[] = [];
    for (const s of strategies) s.dailyValues.forEach((d) => allVals.push(d.value));
    dailyValues.forEach((d) => allVals.push(d.benchmark));
    const min = Math.min(...allVals) * 0.998;
    const max = Math.max(...allVals) * 1.002;
    const range = max - min || 1;
    const pL = 0, pR = 0, pT = 14, pB = 22;
    const cW = w - pL - pR, cH = h - pT - pB;
    const n = dailyValues.length;
    const toX = (i: number) => pL + (i / (n - 1)) * cW;
    const toY = (v: number) => pT + (1 - (v - min) / range) * cH;

    // Baseline
    const baseY = toY(dailyValues[0].benchmark);
    ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pL, baseY); ctx.lineTo(w - pR, baseY); ctx.stroke();
    ctx.setLineDash([]);

    // Benchmark
    ctx.strokeStyle = "#bbb"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    dailyValues.forEach((d, i) => { const x = toX(i), y = toY(d.benchmark); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();

    // Each strategy line
    strategies.forEach((st, si) => {
      const color = COLORS[si];
      if (st.dailyValues.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath();
      st.dailyValues.forEach((d, i) => { const x = toX(i), y = toY(d.value); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.stroke();

      // Gradient fill
      const grad = ctx.createLinearGradient(0, pT, 0, h - pB);
      grad.addColorStop(0, color + "18"); grad.addColorStop(1, color + "00");
      ctx.fillStyle = grad; ctx.beginPath();
      st.dailyValues.forEach((d, i) => { const x = toX(i), y = toY(d.value); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.lineTo(toX(n - 1), h - pB); ctx.lineTo(toX(0), h - pB); ctx.closePath(); ctx.fill();
    });

    // Date labels
    ctx.fillStyle = "#999"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(n / 5));
    for (let i = 0; i < n; i += step) ctx.fillText(dailyValues[i].date.slice(5), toX(i), h - 4);
    ctx.fillText(dailyValues[n - 1].date.slice(5), toX(n - 1), h - 4);

    // Legend
    ctx.textAlign = "left";
    strategies.forEach((st, si) => {
      const x = 8 + si * 80;
      ctx.fillStyle = COLORS[si]; ctx.fillRect(x, 4, 12, 3);
      ctx.fillStyle = "#777"; ctx.font = "9px sans-serif";
      ctx.fillText(st.label, x + 16, 10);
    });
    ctx.fillStyle = "#bbb"; ctx.fillRect(8 + strategies.length * 80, 4, 12, 3);
    ctx.fillStyle = "#999"; ctx.font = "9px sans-serif";
    ctx.fillText("코스피", 8 + strategies.length * 80 + 16, 10);
  }, [dailyValues, strategies]);

  return <canvas ref={canvasRef} className="w-full" style={{ height: 240 }} />;
}

// ── Trade card ────────────────────────────────────────────────
function TradeCard({ trade, isLast }: { trade: Trade; isLast: boolean }) {
  const isBuy = trade.action === "BUY";
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", cursor: "pointer" }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
            background: isBuy ? "#fff0f1" : "#eff4ff", color: isBuy ? "#f04452" : "#3182f6" }}>
            {isBuy ? "매수" : "매도"}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{trade.name}</span>
          {trade.aiReason && (
            <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "#e8f3ff", color: "var(--blue)" }}>AI</span>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 12, color: "var(--text-2)" }}>{trade.shares}주 × {Math.round(trade.price).toLocaleString()}원</p>
          <p style={{ fontSize: 11, color: "var(--text-3)" }}>{trade.date}</p>
        </div>
      </div>

      {open && (
        <div style={{ paddingBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {trade.techReason && (
            <div style={{ padding: "6px 10px", borderRadius: 8, background: "var(--bg)" }}>
              <p style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, marginBottom: 2 }}>📊 기술분석</p>
              <p style={{ fontSize: 12, color: "var(--text-2)" }}>{trade.techReason}</p>
            </div>
          )}
          {trade.aiReason && (
            <div style={{ padding: "6px 10px", borderRadius: 8, background: "#e8f3ff" }}>
              <p style={{ fontSize: 11, color: "var(--blue)", fontWeight: 600, marginBottom: 2 }}>🤖 AI 인사이트</p>
              <p style={{ fontSize: 12, color: "var(--text-2)" }}>{trade.aiReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
type TabId = "holdings" | "trades";

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStrategy, setActiveStrategy] = useState(0);
  const [tab, setTab] = useState<TabId>("holdings");
  const [startDate, setStartDate] = useState("2025-01-01");
  const [inputDate, setInputDate] = useState("2025-01-01");

  const fetchData = (date: string) => {
    setLoading(true);
    setError(null);
    fetch(`/api/portfolio?startDate=${date}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(startDate); }, []);

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "16px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ fontSize: 14, color: "var(--blue)" }}>← 대시보드</Link>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>가상 투자 시뮬레이션</h1>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{startDate} 기준 계산 중…</span>
        </div>
      </header>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {[120, 240, 160].map((h, i) => <div key={i} style={{ height: h, background: "#fff", borderRadius: 16 }} className="animate-pulse" />)}
      </div>
    </main>
  );

  if (error || !data || !data.strategies?.length) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#f04452" }}>에러: {error || "데이터 없음"}</p>
    </main>
  );

  const st = data.strategies[activeStrategy];
  const allDates = data.strategies[0]?.dailyValues || [];
  const benchReturnColor = data.benchmark.returnPct >= 0 ? "#f04452" : "#3182f6";
  const STRATEGY_COLORS = ["#f04452", "#3182f6", "#00b493"];

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "16px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/" style={{ fontSize: 14, color: "var(--blue)" }}>← 대시보드</Link>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>가상 투자 시뮬레이션</h1>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); setStartDate(inputDate); fetchData(inputDate); }}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>시작일</span>
            <input
              type="date"
              value={inputDate}
              min="2020-01-01"
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => setInputDate(e.target.value)}
              style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "1px solid var(--border)", color: "var(--text-1)", background: "#fff" }}
            />
            <button
              type="submit"
              style={{ fontSize: 12, padding: "5px 14px", borderRadius: 8, background: "var(--blue)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}
            >
              조회
            </button>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>~ 오늘 · {fmt(data.startCapital)}원</span>
          </form>
        </div>
      </header>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Strategy comparison header */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.strategies.length + 1}, 1fr)`, gap: 12 }}>
          {data.strategies.map((s, i) => (
            <div
              key={s.id}
              onClick={() => setActiveStrategy(i)}
              style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "var(--shadow)", cursor: "pointer",
                border: `2px solid ${activeStrategy === i ? STRATEGY_COLORS[i] : "transparent"}` }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: STRATEGY_COLORS[i] }} />
                <p style={{ fontSize: 12, fontWeight: 700, color: STRATEGY_COLORS[i] }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>{s.desc}</p>
              <p style={{ fontSize: 22, fontWeight: 800 }}>
                <ReturnBadge pct={s.totalReturnPct} />
              </p>
              <p style={{ fontSize: 12, color: "var(--text-3)" }}>{s.totalReturn >= 0 ? "+" : ""}{fmt(s.totalReturn)}원</p>
            </div>
          ))}
          {/* Benchmark */}
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "var(--shadow)", opacity: 0.75 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#bbb" }} />
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>코스피</p>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>벤치마크</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: benchReturnColor }}>
              {data.benchmark.returnPct >= 0 ? "+" : ""}{data.benchmark.returnPct}%
            </p>
          </div>
        </div>

        {/* Chart */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "16px 20px", boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 12 }}>전략별 포트폴리오 가치 추이</p>
          {allDates.length > 1
            ? <MiniChart dailyValues={allDates} strategies={data.strategies} />
            : <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ fontSize: 13, color: "var(--text-3)" }}>데이터 부족 (최소 2일 필요)</p>
              </div>
          }
        </div>

        {/* Selected strategy detail */}
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "var(--shadow)", overflow: "hidden" }}>
          {/* Strategy tab selector */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 20px" }}>
            {data.strategies.map((s, i) => (
              <button key={s.id} onClick={() => setActiveStrategy(i)}
                style={{ padding: "14px 18px", fontSize: 13, fontWeight: 700, border: "none", background: "transparent", cursor: "pointer",
                  color: activeStrategy === i ? STRATEGY_COLORS[i] : "var(--text-3)",
                  borderBottom: `2px solid ${activeStrategy === i ? STRATEGY_COLORS[i] : "transparent"}` }}>
                {s.label} <ReturnBadge pct={s.totalReturnPct} prefix={true} />
              </button>
            ))}
          </div>

          {/* Holding/Trade tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", padding: "0 20px" }}>
            {(["holdings", "trades"] as TabId[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, border: "none", background: "transparent", cursor: "pointer",
                  color: tab === t ? "var(--blue)" : "var(--text-3)",
                  borderBottom: tab === t ? "2px solid var(--blue)" : "2px solid transparent" }}>
                {t === "holdings" ? `보유 종목 (${st.holdings.length})` : `거래 내역 (${st.trades.length})`}
              </button>
            ))}
          </div>

          <div style={{ padding: "0 20px" }}>
            {/* Holdings */}
            {tab === "holdings" && (
              st.holdings.length === 0
                ? <p style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>현재 보유 종목 없음 (전량 현금)</p>
                : st.holdings.map((h, i) => (
                  <div key={h.ticker} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0",
                    borderBottom: i < st.holdings.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{h.name}</p>
                      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{h.sector} · {h.shares}주 · 평단 {h.avgPrice.toLocaleString()}원</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 14, color: "var(--text-1)" }}>{h.currentPrice.toLocaleString()}원</p>
                      <p style={{ fontSize: 12, color: h.pnl >= 0 ? "#f04452" : "#3182f6", marginTop: 2 }}>
                        {h.pnl >= 0 ? "+" : ""}{fmt(h.pnl)}원 ({h.pnl >= 0 ? "+" : ""}{h.pnlPct}%)
                      </p>
                    </div>
                  </div>
                ))
            )}

            {/* Trades */}
            {tab === "trades" && (
              st.trades.length === 0
                ? <p style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>거래 내역 없음</p>
                : [...st.trades].reverse().map((t, i) => (
                  <TradeCard key={i} trade={t} isLast={i === st.trades.length - 1} />
                ))
            )}
          </div>
        </div>

        {/* AI 신호 통계 */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "16px 20px", boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 12 }}>🤖 AI 신호 기여 분석 ({st.label})</p>
          {(() => {
            const buys = st.trades.filter((t) => t.action === "BUY");
            const aiAssistedBuys = buys.filter((t) => t.aiReason.length > 0);
            const techOnlyBuys = buys.length - aiAssistedBuys.length;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <div style={{ padding: 12, borderRadius: 12, background: "var(--bg)", textAlign: "center" }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)" }}>{buys.length}</p>
                  <p style={{ fontSize: 12, color: "var(--text-3)" }}>총 매수</p>
                </div>
                <div style={{ padding: 12, borderRadius: 12, background: "#e8f3ff", textAlign: "center" }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color: "var(--blue)" }}>{aiAssistedBuys.length}</p>
                  <p style={{ fontSize: 12, color: "var(--blue)" }}>AI 근거 포함</p>
                </div>
                <div style={{ padding: 12, borderRadius: 12, background: "var(--bg)", textAlign: "center" }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color: "var(--text-3)" }}>{techOnlyBuys}</p>
                  <p style={{ fontSize: 12, color: "var(--text-3)" }}>기술분석만</p>
                </div>
              </div>
            );
          })()}
        </div>

      </div>
    </main>
  );
}
