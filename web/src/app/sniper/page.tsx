"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Summary {
  period: string;
  active: boolean;
  daysLeft: number;
  realized_pnl: number;
  trades: number;
  win_rate: number | null;
  open_count: number;
}

interface Position {
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
  exit_label: string | null;   // '🟢 보유' | '⚠️ 촉매 약화' | '🔴 매도 신호' | '📉 고점 이탈' etc
}

interface Signal {
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

// ── Helpers ────────────────────────────────────────────────────────────────────
const BUDGET = 2_000_000;

function fmtMoney(n: number) {
  const abs = Math.abs(n);
  if (abs >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

function fmtDate(s: string) {
  if (!s) return "-";
  return s.replace(/-/g, ".").slice(2); // "26.06.27"
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

// ── Mini bar chart for daily PnL ───────────────────────────────────────────────
function DailyChart({ daily }: { daily: DailyPnL[] }) {
  if (!daily.length) return <p style={{ color: "#b0b8c1", fontSize: 13, padding: "20px 0" }}>아직 청산 내역 없음</p>;

  const maxAbs = Math.max(...daily.map(d => Math.abs(d.daily_pnl)), 1);

  return (
    <div>
      {/* 누적 수익률 라인 */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: "#8b95a1", marginBottom: 8 }}>누적 수익률</p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
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
      </div>

      {/* 일별 손익 테이블 */}
      <div style={{ fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#8b95a1", marginBottom: 6, padding: "0 2px" }}>
          <span>날짜</span>
          <span>당일 손익</span>
          <span>누적</span>
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

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SniperPage() {
  const [tab, setTab] = useState<"positions" | "signals" | "history" | "daily">("positions");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [daily, setDaily] = useState<DailyPnL[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sniper?tab=${t}`);
      const d = await res.json();
      setSummary(d.summary);
      if (t === "positions") setPositions(d.positions ?? []);
      if (t === "signals")   setSignals(d.signals ?? []);
      if (t === "history")   setHistory(d.history ?? []);
      if (t === "daily")     setDaily(d.daily ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const tabs = [
    { id: "positions", label: "📊 현재 포지션" },
    { id: "signals",   label: "📡 오늘 신호" },
    { id: "daily",     label: "📈 일별 수익률" },
    { id: "history",   label: "📋 거래 내역" },
  ] as const;

  return (
    <div style={{ background: "#f2f4f6", minHeight: "100vh", fontFamily: "'Pretendard', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", padding: "18px 24px", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 11, color: "#8b95a1", marginBottom: 4 }}>
              <Link href="/" style={{ color: "#8b95a1", textDecoration: "none" }}>홈</Link>
              {" › "} 스나이퍼 단타
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#191919", letterSpacing: -0.5 }}>
              ⚡ 스나이퍼 단타
            </h1>
            {summary && (
              <p style={{ fontSize: 12, color: "#8b95a1", marginTop: 2 }}>
                {summary.period}
                {summary.active
                  ? <span style={{ marginLeft: 8, color: "#00b493", fontWeight: 600 }}>● 활성 ({summary.daysLeft}일 남음)</span>
                  : <span style={{ marginLeft: 8, color: "#b0b8c1" }}>● 대기 중</span>
                }
              </p>
            )}
          </div>
          <Link href="/screener" style={{ fontSize: 13, color: "#3182f6", textDecoration: "none", fontWeight: 600 }}>
            퀀트 스크리너 →
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px" }}>
        {/* Summary cards */}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "실현 손익", value: `${summary.realized_pnl >= 0 ? "+" : ""}${fmtMoney(summary.realized_pnl)}원`, color: summary.realized_pnl >= 0 ? "#f04452" : "#3182f6" },
              { label: "수익률", value: summary.realized_pnl != null ? `${(summary.realized_pnl / BUDGET * 100 >= 0 ? "+" : "")}${(summary.realized_pnl / BUDGET * 100).toFixed(1)}%` : "-", color: summary.realized_pnl >= 0 ? "#f04452" : "#3182f6" },
              { label: "거래 / 승률", value: summary.trades ? `${summary.trades}회 / ${summary.win_rate}%` : "0회", color: "#191919" },
              { label: "미결 포지션", value: `${summary.open_count}개`, color: "#3182f6" },
            ].map((c, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 16, padding: "14px 16px" }}>
                <p style={{ fontSize: 11, color: "#8b95a1", marginBottom: 6 }}>{c.label}</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: c.color, letterSpacing: -0.5 }}>{c.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "9px 16px", borderRadius: 12, border: "none", fontSize: 13, fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap",
                background: tab === t.id ? "#191919" : "#fff",
                color: tab === t.id ? "#fff" : "#8b95a1",
                boxShadow: tab === t.id ? "0 2px 8px rgba(0,0,0,0.15)" : "none" }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <p style={{ textAlign: "center", color: "#b0b8c1", padding: 40 }}>로딩 중...</p>}

        {/* 포지션 탭 */}
        {!loading && tab === "positions" && (
          <div>
            {!summary?.active && (
              <div style={{ background: "#fff8e6", borderRadius: 16, padding: "16px 20px", marginBottom: 12, border: "1px solid #fde68a" }}>
                <p style={{ fontSize: 14, color: "#92400e", fontWeight: 600 }}>⏰ 스나이퍼 기간이 아닙니다</p>
                <p style={{ fontSize: 13, color: "#b45309", marginTop: 4 }}>매달 25일부터 다음달 10일 사이에만 전략이 활성화됩니다.</p>
              </div>
            )}

            {positions.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: "32px 20px", textAlign: "center" }}>
                <p style={{ color: "#b0b8c1", fontSize: 15 }}>현재 보유 포지션 없음</p>
                <p style={{ color: "#b0b8c1", fontSize: 13, marginTop: 6 }}>신호 탭에서 오늘의 진입 후보를 확인하세요</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {positions.map(pos => {
                  const holdDays  = Math.floor((Date.now() - new Date(pos.entry_date).getTime()) / 86400000);
                  const label     = pos.exit_label ?? "🟢 보유";
                  const isSell    = ["🔴","🛑","📉","📰","⏰"].some(e => label.includes(e));
                  const isWatch   = label.includes("⚠️");
                  const cardBorder = isSell ? "2px solid #f04452" : isWatch ? "2px solid #f5a623" : "1.5px solid #e5e7eb";
                  const cardBg     = isSell ? "#fff5f5" : isWatch ? "#fffbeb" : "#fff";

                  return (
                    <div key={pos.id} style={{ background: cardBg, borderRadius: 16, padding: "18px 20px", border: cardBorder }}>
                      {/* 매도 신호 배너 (강조) */}
                      {isSell && (
                        <div style={{ background: "#f04452", borderRadius: 8, padding: "8px 12px", marginBottom: 12,
                          display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{label}</span>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>— 매도를 검토하세요</span>
                        </div>
                      )}
                      {isWatch && (
                        <div style={{ background: "#f5a623", borderRadius: 8, padding: "6px 12px", marginBottom: 12,
                          display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{label}</span>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>— 모니터링 필요</span>
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div>
                          <span style={{ fontSize: 16, fontWeight: 700, color: "#191919" }}>{pos.stock_name}</span>
                          <span style={{ fontSize: 12, color: "#b0b8c1", marginLeft: 8 }}>{pos.stock_code}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#8b95a1", background: "#f2f4f6", padding: "3px 8px", borderRadius: 6 }}>
                          D+{holdDays}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, fontSize: 13 }}>
                        <div><p style={{ color: "#8b95a1", fontSize: 11 }}>진입가</p><p style={{ fontWeight: 700 }}>{pos.entry_price.toLocaleString()}원</p></div>
                        <div><p style={{ color: "#8b95a1", fontSize: 11 }}>보유 수량</p><p style={{ fontWeight: 700 }}>{pos.shares}주</p></div>
                        <div><p style={{ color: "#8b95a1", fontSize: 11 }}>투자금</p><p style={{ fontWeight: 700 }}>{fmtMoney(pos.cost)}원</p></div>
                      </div>

                      <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(0,0,0,0.04)", borderRadius: 10, fontSize: 12, color: "#8b95a1", display: "flex", justifyContent: "space-between" }}>
                        <span>익절 목표: <b style={{ color: "#f04452" }}>+7% ({Math.round(pos.entry_price * 1.07).toLocaleString()}원)</b></span>
                        <span>손절선: <b style={{ color: "#3182f6" }}>-5% ({Math.round(pos.entry_price * 0.95).toLocaleString()}원)</b></span>
                        {pos.max_price && pos.max_price > pos.entry_price * 1.05 && (
                          <span>트레일링: <b style={{ color: "#f5a623" }}>{Math.round(pos.max_price * 0.96).toLocaleString()}원</b></span>
                        )}
                      </div>

                      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                        <div style={{ flex: 1, background: "#f0fdf4", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#057a55" }}>
                          📰 뉴스 {(pos.news_score * 100).toFixed(0)}점
                        </div>
                        <div style={{ flex: 1, background: "#eff6ff", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#1a56db" }}>
                          📺 유튜브 {(pos.yt_score * 100).toFixed(0)}점
                        </div>
                        <div style={{ flex: 1, background: "#fdf4ff", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#7e22ce" }}>
                          ⚡ 종합 {(pos.signal_score * 100).toFixed(0)}점
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 오늘 신호 탭 */}
        {!loading && tab === "signals" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: "#fff8e6", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#92400e" }}>
              💡 신호 기준: BUY 등급 + 오늘 호재 뉴스 또는 유튜브 언급 종목 우선
            </div>
            {signals.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: "32px", textAlign: "center", color: "#b0b8c1" }}>
                오늘 진입 신호 없음
              </div>
            ) : (
              signals.map((s, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 16, padding: "16px 18px",
                  borderLeft: s.has_catalyst ? "4px solid #f04452" : "4px solid #e5e7eb" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#191919" }}>{s.stock_name}</span>
                      {s.has_catalyst && <span style={{ fontSize: 11, background: "#fef2f2", color: "#c81e1e", padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>🔥 촉매</span>}
                      <span style={{ fontSize: 11, color: "#b0b8c1" }}>{s.sector}</span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#f04452" }}>{s.composite_score.toFixed(1)}</span>
                  </div>
                  {s.news_today && (
                    <div style={{ fontSize: 12, color: "#057a55", background: "#f0fdf4", padding: "6px 10px", borderRadius: 8, marginBottom: 8 }}>
                      📰 {s.news_today.sentiment} · {s.news_today.trading_signal} · 영향도 {s.news_today.news_impact_score}점
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#8b95a1" }}>
                    <span>기술 {(s.tech_score ?? 50).toFixed(0)}</span>
                    <span>·</span>
                    <span>유튜브 {(s.yt_score ?? 50).toFixed(0)}</span>
                    <span>·</span>
                    <span>뉴스 {(s.news_score ?? 50).toFixed(0)}</span>
                    <span>·</span>
                    <span>팩터 {(s.factor_score ?? 50).toFixed(0)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 일별 수익률 탭 */}
        {!loading && tab === "daily" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px" }}>
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
        {!loading && tab === "history" && (
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden" }}>
            {history.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#b0b8c1" }}>이번 기간 청산 내역 없음</div>
            ) : (
              history.map((h, i) => {
                const win = (h.pnl_pct ?? 0) > 0;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 18px", borderBottom: i < history.length - 1 ? "1px solid #f2f4f6" : "none" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#191919" }}>{h.stock_name}</p>
                      <p style={{ fontSize: 12, color: "#b0b8c1" }}>
                        {fmtDate(h.entry_date)} 진입 → {fmtDate(h.exit_date)} 청산 · {h.exit_reason}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <PnlBadge pct={h.pnl_pct} amt={h.pnl_amount} />
                      <p style={{ fontSize: 11, color: "#b0b8c1", marginTop: 2 }}>
                        {h.entry_price?.toLocaleString()} → {h.exit_price?.toLocaleString()}원
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
