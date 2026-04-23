"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { StockChart } from "@/components/StockChart";
import { resolveTickerInput, TICKER_TO_NAME } from "@/lib/stocks";
import { searchByStock } from "@/lib/api";
import type { YoutubeInsight } from "@/lib/types";

interface Quote {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockData {
  ticker: string;
  name: string;
  quotes: Quote[];
}

/* ── 기술 지표 계산 ─────────────────────────────────────────── */
function calcMA(quotes: Quote[], period: number): (number | null)[] {
  return quotes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = quotes.slice(i - period + 1, i + 1);
    return slice.reduce((s, q) => s + q.close, 0) / period;
  });
}

function calcRSI(quotes: Quote[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(quotes.length).fill(null);
  if (quotes.length < period + 1) return rsi;
  let gainSum = 0,
    lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = quotes[i].close - quotes[i - 1].close;
    if (diff > 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < quotes.length; i++) {
    const diff = quotes[i].close - quotes[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

/* ── 진입 신호 계산 ─────────────────────────────────────────── */
type SignalStatus = "pass" | "warn" | "fail";

interface EntrySignal {
  label: string;
  detail: string;
  status: SignalStatus;
}

/* ── 지지/저항선 ─────────────────────────────────────────────── */
function calcSupportResistance(quotes: Quote[], lookback = 30) {
  const window = quotes.slice(-lookback);
  const support = Math.min(...window.map(q => q.low));
  const resistance = Math.max(...window.map(q => q.high));
  return { support, resistance };
}

/* ── 다우 이론 ────────────────────────────────────────────────── */
function calcDowTrend(quotes: Quote[], window = 40): { trend: "up" | "down" | "sideways"; detail: string } {
  if (quotes.length < window) return { trend: "sideways", detail: "데이터 부족" };
  const recent = quotes.slice(-window);
  const half = Math.floor(window / 2);
  const first = recent.slice(0, half);
  const second = recent.slice(half);
  const fMax = Math.max(...first.map(q => q.high));
  const fMin = Math.min(...first.map(q => q.low));
  const sMax = Math.max(...second.map(q => q.high));
  const sMin = Math.min(...second.map(q => q.low));
  if (sMax > fMax && sMin > fMin) return { trend: "up", detail: "고점·저점 모두 상승" };
  if (sMax < fMax && sMin < fMin) return { trend: "down", detail: "고점·저점 모두 하락" };
  return { trend: "sideways", detail: "방향성 미확인" };
}

function calcEntrySignals(quotes: Quote[]): {
  signals: EntrySignal[];
  satisfied: number;
  warnCount: number;
  total: number;
} {
  if (quotes.length < 60)
    return { signals: [], satisfied: 0, warnCount: 0, total: 0 };

  const ma5 = calcMA(quotes, 5);
  const ma20 = calcMA(quotes, 20);
  const ma60 = calcMA(quotes, 60);
  const rsiArr = calcRSI(quotes);
  const n = quotes.length - 1;

  const m5 = ma5[n] ?? 0;
  const m20 = ma20[n] ?? 0;
  const m60 = ma60[n] ?? 0;
  const rsi = rsiArr[n] ?? 50;

  const maFullAlign = m5 > m20 && m20 > m60;
  const maPartial = !maFullAlign && (m5 > m20 || m20 > m60);
  const condMA: SignalStatus = maFullAlign ? "pass" : maPartial ? "warn" : "fail";

  let gcDay: number | null = null;
  for (let i = n; i >= Math.max(n - 20, 1); i--) {
    const prev5 = ma5[i - 1];
    const prev20 = ma20[i - 1];
    const cur5 = ma5[i];
    const cur20 = ma20[i];
    if (prev5 !== null && prev20 !== null && cur5 !== null && cur20 !== null) {
      if (prev5 <= prev20 && cur5 > cur20) {
        gcDay = n - i;
        break;
      }
    }
  }
  const condGC: SignalStatus =
    gcDay !== null && gcDay <= 10 ? "pass" : gcDay !== null ? "warn" : "fail";
  const gcDetail =
    gcDay !== null ? `${gcDay}일 전 발생` : "미발생";

  const condRSI: SignalStatus =
    rsi >= 40 && rsi <= 60 ? "pass" : rsi >= 30 && rsi <= 70 ? "warn" : "fail";

  const volSlice = quotes.slice(-20).map((q) => q.volume);
  const avgVol = volSlice.reduce((a, b) => a + b, 0) / volSlice.length;
  const volRatio = avgVol > 0 ? quotes[n].volume / avgVol : 1;
  const condVol: SignalStatus =
    volRatio >= 1.2 ? "pass" : volRatio >= 0.8 ? "warn" : "fail";

  const weekly: number[] = [];
  for (let i = 0; i < quotes.length; i += 5) {
    const end = Math.min(i + 5, quotes.length);
    weekly.push(quotes[end - 1].close);
  }
  let condWeekly: SignalStatus = "fail";
  if (weekly.length >= 12) {
    const wma4 = weekly.slice(-4).reduce((a, b) => a + b, 0) / 4;
    const wma12 = weekly.slice(-12).reduce((a, b) => a + b, 0) / 12;
    const diff = (wma4 - wma12) / wma12;
    condWeekly = diff > 0.02 ? "pass" : diff > -0.02 ? "warn" : "fail";
  }
  const weeklyLabel =
    condWeekly === "pass" ? "상승" : condWeekly === "warn" ? "횡보" : "하락";

  const fmt = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

  // 지지/저항선
  const { support, resistance } = calcSupportResistance(quotes, 30);
  const curPrice = quotes[n].close;
  const nearSupport = (curPrice - support) / support < 0.03;
  const nearResistance = (resistance - curPrice) / curPrice < 0.02;
  const condSR: SignalStatus = nearSupport ? "pass" : nearResistance ? "fail" : "warn";
  const srDetail = nearSupport
    ? `지지선(${fmt(support)}) 근접`
    : nearResistance
      ? `저항선(${fmt(resistance)}) 근접`
      : `지지 ${fmt(support)} / 저항 ${fmt(resistance)}`;

  // 다우 이론
  const { trend, detail: dowDetail } = calcDowTrend(quotes, 40);
  const condDow: SignalStatus = trend === "up" ? "pass" : trend === "sideways" ? "warn" : "fail";

  const signals: EntrySignal[] = [
    {
      label: "정배열",
      detail: `MA5(${fmt(m5)}) > MA20(${fmt(m20)}) > MA60(${fmt(m60)})`,
      status: condMA,
    },
    {
      label: "골든크로스",
      detail: gcDetail,
      status: condGC,
    },
    {
      label: "RSI",
      detail: `${rsi.toFixed(1)} (40~60 적정)`,
      status: condRSI,
    },
    {
      label: "주봉 추세",
      detail: weeklyLabel,
      status: condWeekly,
    },
    {
      label: "거래량",
      detail: `${volRatio.toFixed(1)}x (20일 평균 대비)`,
      status: condVol,
    },
    {
      label: "지지/저항",
      detail: srDetail,
      status: condSR,
    },
    {
      label: "다우 추세",
      detail: dowDetail,
      status: condDow,
    },
  ];

  const total = signals.length;
  return {
    signals,
    satisfied: signals.filter((s) => s.status === "pass").length,
    warnCount: signals.filter((s) => s.status === "warn").length,
    total,
  };
}

/* ── 예측 점수 (단일 시점) ───────────────────────────────────── */
function predictionScore(quotes: Quote[], upTo: number): number {
  if (upTo < 20) return 0.5;
  const slice = quotes.slice(0, upTo + 1);
  const rsiArr = calcRSI(slice);
  const n = slice.length - 1;
  const rsi = rsiArr[n] ?? 50;
  const ma5 = calcMA(slice, 5);
  const ma20 = calcMA(slice, 20);
  const m5 = ma5[n] ?? slice[n].close;
  const m20 = ma20[n] ?? slice[n].close;

  let score = 0.5;
  if (rsi < 30) score += 0.12;
  else if (rsi < 40) score += 0.06;
  else if (rsi > 70) score -= 0.12;
  else if (rsi > 60) score -= 0.04;
  if (m5 > m20) score += 0.06;
  else score -= 0.06;
  const ret5 = (slice[n].close - slice[Math.max(n - 5, 0)].close) / slice[Math.max(n - 5, 0)].close;
  score += ret5 * 0.5;
  return Math.max(0.15, Math.min(0.85, score));
}

/* ── Option A: 과거 N일 백테스트 적중률 ─────────────────────── */
function calcBacktestAccuracy(quotes: Quote[], days = 60): { correct: number; total: number; rate: number } {
  let correct = 0, total = 0;
  // 워밍업 20일 + 검증 days일 + 결과 확인 1일 필요
  const start = Math.max(20, quotes.length - days - 1);
  for (let i = start; i < quotes.length - 1; i++) {
    const prob = predictionScore(quotes, i);
    const predictedUp = prob >= 0.5;
    const actualUp = quotes[i + 1].close > quotes[i].close;
    if (predictedUp === actualUp) correct++;
    total++;
  }
  return { correct, total, rate: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0 };
}

/* ── AI 예측 (간이) ─────────────────────────────────────────── */
function calcPrediction(quotes: Quote[]) {
  if (quotes.length < 60) return null;
  const n = quotes.length - 1;
  const score = predictionScore(quotes, n);
  const expectedReturn = (score - 0.5) * 0.04;
  const close = quotes[n].close;

  return {
    probability: score,
    expectedLo: close * (1 + expectedReturn - 0.012),
    expectedHi: close * (1 + expectedReturn + 0.012),
    returnLo: (expectedReturn - 0.012) * 100,
    returnHi: (expectedReturn + 0.012) * 100,
  };
}

/* ── 포맷 헬퍼 ──────────────────────────────────────────────── */
function fmtKRW(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}
function fmtDate(d: string | null) {
  if (!d) return "";
  if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  return d.slice(0, 10);
}

/* ══════════════════════════════════════════════════════════════ */
/*  메인 컴포넌트                                                 */
/* ══════════════════════════════════════════════════════════════ */
function StockContent() {
  const searchParams = useSearchParams();
  const rawTicker = searchParams.get("ticker") || "";
  const ticker = resolveTickerInput(rawTicker);

  const [data, setData] = useState<StockData | null>(null);
  const [period, setPeriod] = useState("1y");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState<YoutubeInsight[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [newsData, setNewsData] = useState<any>(null);
  const [liveAccuracy, setLiveAccuracy] = useState<{ total: number; correct: number; rate: number | null } | null>(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError("");
    fetch(`/api/stock?ticker=${encodeURIComponent(ticker)}&period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); setData(null); }
        else setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("데이터를 가져올 수 없습니다.");
        setLoading(false);
      });
  }, [ticker, period]);

  useEffect(() => {
    if (!ticker) return;
    const name = TICKER_TO_NAME[ticker] || rawTicker;
    searchByStock(name, 10).then(setInsights);
    const code = ticker.split(".")[0];
    fetch(`/api/news?code=${code}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d) && d.length > 0) setNewsData(d[0]); })
      .catch(() => {});
    fetch(`/api/prediction-log?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setLiveAccuracy(d); })
      .catch(() => {});
  }, [ticker, rawTicker]);

  const displayName = data?.name
    ? TICKER_TO_NAME[ticker] || data.name
    : TICKER_TO_NAME[ticker] || rawTicker;

  const quotes = data?.quotes ?? [];
  const latest = quotes[quotes.length - 1];
  const prev = quotes.length > 1 ? quotes[quotes.length - 2] : latest;

  const change = latest ? latest.close - (prev?.close ?? latest.close) : 0;
  const changePct = prev?.close ? (change / prev.close) * 100 : 0;

  const entry = useMemo(() => calcEntrySignals(quotes), [quotes]);
  const prediction = useMemo(() => calcPrediction(quotes), [quotes]);
  const accuracy = useMemo(() => calcBacktestAccuracy(quotes, 60), [quotes]);

  const totalScore = entry.satisfied + entry.warnCount * 0.5;
  const maxScore = entry.total || 7;
  const judgeLabel =
    totalScore >= maxScore * 0.7 ? "진입 추천" : totalScore >= maxScore * 0.45 ? "대기" : "위험";
  const judgeColor =
    totalScore >= maxScore * 0.7 ? "#00b493" : totalScore >= maxScore * 0.45 ? "#f5a623" : "#f04452";
  const judgeEmoji =
    totalScore >= maxScore * 0.7 ? "🟢" : totalScore >= maxScore * 0.45 ? "🟡" : "🔴";

  const chgColor = change >= 0 ? "#f04452" : "#3182f6";
  const chgArrow = change > 0 ? "▲" : change < 0 ? "▼" : "―";
  const chgSign = change >= 0 ? "+" : "";

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* ── 헤더 ── */}
      <header
        className="px-6 py-3"
        style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
      >
        <div className="max-w-[1400px] mx-auto flex items-center gap-4">
          <Link
            href="/"
            className="text-sm hover:opacity-70 transition-opacity font-medium"
            style={{ color: "var(--blue)" }}
          >
            ← 대시보드
          </Link>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-5 space-y-5">
        {/* ── 상단: 종목 헤더 ── */}
        {latest && (
          <div
            className="rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
            }}
          >
            <div>
              <div className="flex items-baseline gap-3 mb-1">
                <span
                  className="text-3xl font-black"
                  style={{
                    color: "var(--text-1)",
                    fontFamily: "'Noto Sans KR', sans-serif",
                    letterSpacing: "-1px",
                  }}
                >
                  {displayName}
                </span>
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-3)", fontFamily: "monospace" }}
                >
                  {ticker}
                </span>
              </div>
              <div
                className="text-xs"
                style={{ color: "var(--text-3)", letterSpacing: "1px" }}
              >
                {period.toUpperCase()} &middot; {quotes.length} trading days
              </div>
            </div>
            <div className="text-right">
              <div
                className="text-4xl font-bold"
                style={{
                  color: "var(--text-1)",
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "-1px",
                }}
              >
                {fmtKRW(latest.close)}
                <span
                  className="text-sm font-normal ml-1"
                  style={{ color: "var(--text-3)" }}
                >
                  원
                </span>
              </div>
              <div
                className="text-sm font-semibold mt-1"
                style={{ color: chgColor, fontFamily: "monospace" }}
              >
                {chgArrow} {chgSign}
                {fmtKRW(Math.abs(change))}원 ({chgSign}
                {changePct.toFixed(2)}%)
              </div>
            </div>
          </div>
        )}

        {/* ── 로딩/에러 ── */}
        {loading && (
          <div
            className="rounded-xl p-16 text-center animate-pulse"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <p style={{ color: "var(--text-3)" }}>차트 로딩 중...</p>
          </div>
        )}
        {error && (
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: "var(--card)", border: "1px solid #f0445230" }}
          >
            <p style={{ color: "#f04452" }}>{error}</p>
          </div>
        )}

        {/* ── 차트 (전체 너비) ── */}
        {data && !loading && (
          <div className="space-y-5">
            <StockChart
              data={data}
              period={period}
              onPeriodChange={setPeriod}
            />

            {/* ── 진입 신호 판단 (전체 너비) ── */}
            <div
              className="rounded-xl p-5"
              style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-sm font-bold"
                  style={{ color: "var(--text-1)" }}
                >
                  진입 신호
                </span>
                <span
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold"
                  style={{
                    color: judgeColor,
                    background: `${judgeColor}18`,
                    border: `1px solid ${judgeColor}40`,
                  }}
                >
                  {judgeEmoji} {judgeLabel}
                </span>
              </div>

              {/* 프로그레스 */}
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: "var(--text-3)" }}>조건 충족</span>
                  <span
                    className="font-semibold"
                    style={{
                      color: judgeColor,
                      fontFamily: "monospace",
                    }}
                  >
                    {entry.satisfied}/{maxScore}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--border)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(entry.satisfied / maxScore) * 100}%`,
                      background: judgeColor,
                    }}
                  />
                </div>
              </div>

              {/* 조건 목록 - 가로 그리드 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
                {entry.signals.map((s) => {
                  const icon = s.status === "pass" ? "✅" : s.status === "warn" ? "⚠️" : "❌";
                  const borderColor = s.status === "pass" ? "#00b493" : s.status === "warn" ? "#f5a623" : "#f04452";
                  const bgColor = s.status === "pass"
                    ? "#e5f9f4"
                    : s.status === "warn"
                      ? "#fff8e6"
                      : "#fff0f1";
                  return (
                    <div
                      key={s.label}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
                      style={{
                        background: bgColor,
                        borderLeft: `3px solid ${borderColor}`,
                      }}
                    >
                      <span className="text-sm">{icon}</span>
                      <div className="min-w-0">
                        <div
                          className="text-xs font-semibold"
                          style={{ color: "var(--text-1)" }}
                        >
                          {s.label}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--text-3)" }}
                        >
                          {s.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 뉴스 + 수급 (2컬럼) ── */}
            {newsData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* 뉴스/공시 */}
                <div
                  className="rounded-xl p-5"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className="text-sm font-bold"
                      style={{ color: "var(--text-1)" }}
                    >
                      뉴스
                    </span>
                    {(() => {
                      const analysis = typeof newsData.analysis === "string"
                        ? JSON.parse(newsData.analysis) : newsData.analysis || {};
                      const sent = analysis.sentiment || "중립";
                      const sentColor = sent === "호재" ? "#00b493" : sent === "악재" ? "#f04452" : "#f5a623";
                      return (
                        <span
                          className="text-xs font-bold px-3 py-1 rounded-full"
                          style={{ color: sentColor, background: `${sentColor}18`, border: `1px solid ${sentColor}40` }}
                        >
                          {sent}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Claude 분석 요약 */}
                  {(() => {
                    const analysis = typeof newsData.analysis === "string"
                      ? JSON.parse(newsData.analysis) : newsData.analysis || {};
                    return analysis.summary ? (
                      <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text-2)" }}>
                        {analysis.summary}
                      </p>
                    ) : null;
                  })()}

                  {/* 뉴스 목록 */}
                  <div className="space-y-1.5">
                    {(typeof newsData.articles === "string"
                      ? JSON.parse(newsData.articles) : newsData.articles || []
                    ).slice(0, 5).map((a: { title: string; url: string; date: string; source: string }, i: number) => (
                      <a
                        key={i}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-3 py-2 rounded-lg transition-colors"
                        style={{ background: "var(--bg)" }}
                      >
                        <div className="text-sm font-medium line-clamp-1" style={{ color: "var(--text-1)" }}>
                          {a.title}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                          {a.source} · {a.date}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>

                {/* 외국인/기관 수급 */}
                <div
                  className="rounded-xl p-5"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
                >
                  <span
                    className="text-sm font-bold block mb-4"
                    style={{ color: "var(--text-1)" }}
                  >
                    외국인/기관 수급
                  </span>

                  {(() => {
                    const investors: { date: string; close: number; foreign_net: number; institution_net: number }[] =
                      typeof newsData.investor_data === "string"
                        ? JSON.parse(newsData.investor_data) : newsData.investor_data || [];
                    if (investors.length === 0) return (
                      <div className="text-center py-4 text-sm" style={{ color: "var(--text-3)" }}>수급 데이터 없음</div>
                    );

                    const foreign5 = investors.slice(0, 5).reduce((s, d) => s + d.foreign_net, 0);
                    const inst5 = investors.slice(0, 5).reduce((s, d) => s + d.institution_net, 0);
                    const fColor = foreign5 >= 0 ? "#f04452" : "#3182f6";
                    const iColor = inst5 >= 0 ? "#f04452" : "#3182f6";

                    return (
                      <>
                        {/* 5일 합계 */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg)" }}>
                            <div className="text-xs mb-1" style={{ color: "var(--text-3)" }}>외국인 5일</div>
                            <div className="text-sm font-bold" style={{ color: fColor, fontFamily: "monospace" }}>
                              {foreign5 >= 0 ? "+" : ""}{foreign5.toLocaleString("ko-KR")}
                            </div>
                          </div>
                          <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg)" }}>
                            <div className="text-xs mb-1" style={{ color: "var(--text-3)" }}>기관 5일</div>
                            <div className="text-sm font-bold" style={{ color: iColor, fontFamily: "monospace" }}>
                              {inst5 >= 0 ? "+" : ""}{inst5.toLocaleString("ko-KR")}
                            </div>
                          </div>
                        </div>

                        {/* 일별 테이블 */}
                        <div className="space-y-1">
                          <div className="flex text-xs font-semibold px-2 py-1" style={{ color: "var(--text-3)" }}>
                            <span className="w-20">날짜</span>
                            <span className="flex-1 text-right">외국인</span>
                            <span className="flex-1 text-right">기관</span>
                          </div>
                          {investors.slice(0, 7).map((d, i) => (
                            <div key={i} className="flex text-xs px-2 py-1.5 rounded" style={{ background: i % 2 === 0 ? "var(--bg)" : "transparent" }}>
                              <span className="w-20" style={{ color: "var(--text-3)" }}>{d.date}</span>
                              <span className="flex-1 text-right font-medium" style={{ color: d.foreign_net >= 0 ? "#f04452" : "#3182f6", fontFamily: "monospace" }}>
                                {d.foreign_net >= 0 ? "+" : ""}{d.foreign_net.toLocaleString("ko-KR")}
                              </span>
                              <span className="flex-1 text-right font-medium" style={{ color: d.institution_net >= 0 ? "#f04452" : "#3182f6", fontFamily: "monospace" }}>
                                {d.institution_net >= 0 ? "+" : ""}{d.institution_net.toLocaleString("ko-KR")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── AI 예측 + 유튜브 인사이트 (2컬럼) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* AI 예측 */}
              <div
                className="rounded-xl p-5"
                style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
              >
                <div
                  className="text-sm font-bold mb-4"
                  style={{ color: "var(--text-1)" }}
                >
                  AI 예측
                </div>

                {prediction ? (
                  <>
                    <div className="text-center mb-4">
                      <div
                        className="text-xs mb-1"
                        style={{ color: "var(--text-3)" }}
                      >
                        내일 상승 확률
                      </div>
                      <div
                        className="text-5xl font-bold leading-none"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color:
                            prediction.probability >= 0.55
                              ? "#00b493"
                              : prediction.probability < 0.45
                                ? "#f04452"
                                : "#f5a623",
                        }}
                      >
                        {(prediction.probability * 100).toFixed(1)}
                        <span
                          className="text-lg"
                          style={{ color: "var(--text-3)" }}
                        >
                          %
                        </span>
                      </div>
                      {/* 바 */}
                      <div
                        className="h-1.5 rounded-full overflow-hidden mt-3 mx-auto"
                        style={{ background: "var(--border)", maxWidth: "200px" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${prediction.probability * 100}%`,
                            background: `linear-gradient(90deg, #3182f6, ${prediction.probability >= 0.55 ? "#00b493" : prediction.probability < 0.45 ? "#f04452" : "#f5a623"})`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div
                        className="rounded-lg p-3 text-center"
                        style={{ background: "var(--bg)" }}
                      >
                        <div
                          className="text-xs mb-1"
                          style={{ color: "var(--text-3)" }}
                        >
                          예상 등락
                        </div>
                        <div
                          className="text-sm font-semibold"
                          style={{
                            fontFamily: "monospace",
                            color:
                              prediction.probability >= 0.5
                                ? "#00b493"
                                : "#f04452",
                          }}
                        >
                          {prediction.returnLo >= 0 ? "+" : ""}
                          {prediction.returnLo.toFixed(1)}% ~{" "}
                          {prediction.returnHi >= 0 ? "+" : ""}
                          {prediction.returnHi.toFixed(1)}%
                        </div>
                      </div>
                      <div
                        className="rounded-lg p-3 text-center"
                        style={{ background: "var(--bg)" }}
                      >
                        <div
                          className="text-xs mb-1"
                          style={{ color: "var(--text-3)" }}
                        >
                          예상 종가
                        </div>
                        <div
                          className="text-sm font-semibold"
                          style={{ fontFamily: "monospace", color: "var(--text-1)" }}
                        >
                          {fmtKRW(prediction.expectedLo)} ~{" "}
                          {fmtKRW(prediction.expectedHi)}
                        </div>
                      </div>
                    </div>

                    <div
                      className="text-xs text-center mt-3"
                      style={{ color: "var(--text-3)" }}
                    >
                      Technical indicator-based estimation &middot; Not
                      financial advice
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {accuracy.total > 0 && (
                        <div
                          className="rounded-lg px-3 py-2 flex items-center justify-between"
                          style={{ background: "var(--bg)" }}
                        >
                          <span className="text-xs" style={{ color: "var(--text-3)" }}>
                            과거 60일 백테스트
                          </span>
                          <span>
                            <span
                              className="text-sm font-bold"
                              style={{
                                fontFamily: "monospace",
                                color: accuracy.rate >= 55 ? "#00b493" : accuracy.rate >= 45 ? "#f5a623" : "#f04452",
                              }}
                            >
                              {accuracy.rate}%
                            </span>
                            <span className="text-xs ml-1" style={{ color: "var(--text-3)" }}>
                              ({accuracy.correct}/{accuracy.total})
                            </span>
                          </span>
                        </div>
                      )}
                      {liveAccuracy && liveAccuracy.total > 0 && (
                        <div
                          className="rounded-lg px-3 py-2 flex items-center justify-between"
                          style={{ background: "var(--bg)" }}
                        >
                          <span className="text-xs" style={{ color: "var(--text-3)" }}>
                            실시간 누적 적중률
                          </span>
                          <span>
                            {liveAccuracy.rate !== null ? (
                              <span
                                className="text-sm font-bold"
                                style={{
                                  fontFamily: "monospace",
                                  color: liveAccuracy.rate >= 55 ? "#00b493" : liveAccuracy.rate >= 45 ? "#f5a623" : "#f04452",
                                }}
                              >
                                {liveAccuracy.rate}%
                              </span>
                            ) : (
                              <span className="text-xs" style={{ color: "var(--text-3)" }}>집계 중</span>
                            )}
                            <span className="text-xs ml-1" style={{ color: "var(--text-3)" }}>
                              ({liveAccuracy.correct}/{liveAccuracy.total})
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div
                    className="text-center py-4 text-sm"
                    style={{ color: "var(--text-3)" }}
                  >
                    데이터 부족 (60일 이상 필요)
                  </div>
                )}
              </div>

              {/* 유튜브 인사이트 */}
              <div
                className="rounded-xl p-5"
                style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
              >
                <div
                  className="text-sm font-bold mb-4"
                  style={{ color: "var(--text-1)" }}
                >
                  YouTube 인사이트
                </div>

                {insights.length === 0 ? (
                  <div
                    className="text-center py-4 text-sm"
                    style={{ color: "var(--text-3)" }}
                  >
                    관련 인사이트 없음
                  </div>
                ) : (
                  <div className="space-y-2">
                    {insights
                      .slice(0, showMore ? undefined : 3)
                      .map((item) => {
                        const sentColor =
                          item.market_sentiment === "긍정"
                            ? "#00b493"
                            : item.market_sentiment === "부정"
                              ? "#f04452"
                              : "#8b95a1";
                        const typeColor =
                          item.trading_type === "단타"
                            ? "#f97316"
                            : item.trading_type === "스윙"
                              ? "#3182f6"
                              : "#a855f7";
                        const isOpen = expandedInsight === item.video_id;

                        return (
                          <div
                            key={item.video_id}
                            className="rounded-lg overflow-hidden"
                            style={{
                              background: "var(--bg)",
                              border: isOpen ? "1px solid var(--border)" : "1px solid transparent",
                            }}
                          >
                            {/* 헤더 - 클릭으로 접기/펼치기 */}
                            <button
                              onClick={() => setExpandedInsight(isOpen ? null : item.video_id)}
                              className="w-full text-left p-3 transition-colors"
                            >
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded font-semibold"
                                  style={{
                                    color: sentColor,
                                    background: `${sentColor}18`,
                                  }}
                                >
                                  {item.market_sentiment}
                                </span>
                                {item.trading_type && (
                                  <span
                                    className="text-xs px-1.5 py-0.5 rounded font-semibold"
                                    style={{
                                      color: typeColor,
                                      background: `${typeColor}18`,
                                    }}
                                  >
                                    {item.trading_type}
                                  </span>
                                )}
                                <span
                                  className="text-xs ml-auto"
                                  style={{ color: "var(--text-3)" }}
                                >
                                  {fmtDate(item.upload_date)}
                                </span>
                                <span className="text-xs ml-1" style={{ color: "var(--text-3)" }}>
                                  {isOpen ? "▲" : "▼"}
                                </span>
                              </div>
                              <div
                                className="text-sm font-semibold line-clamp-2"
                                style={{ color: "var(--text-1)" }}
                              >
                                {item.title}
                              </div>
                              <div
                                className="text-xs mt-1"
                                style={{ color: "var(--text-3)" }}
                              >
                                {item.channel}
                              </div>
                            </button>

                            {/* 펼침 영역 - 요약 + 링크 */}
                            {isOpen && (
                              <div
                                className="px-3 pb-3 pt-2 border-t"
                                style={{ borderColor: "var(--border)" }}
                              >
                                <p
                                  className="text-sm leading-relaxed mb-2"
                                  style={{ color: "var(--text-2)" }}
                                >
                                  {item.summary}
                                </p>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-semibold hover:underline"
                                  style={{ color: "var(--blue)" }}
                                >
                                  YouTube에서 보기 →
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {insights.length > 3 && !showMore && (
                      <button
                        onClick={() => setShowMore(true)}
                        className="w-full py-2 text-sm rounded-lg transition-colors font-medium"
                        style={{
                          color: "var(--blue)",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        더보기 ({insights.length - 3}건)
                      </button>
                    )}
                    {showMore && (
                      <button
                        onClick={() => setShowMore(false)}
                        className="w-full py-2 text-sm rounded-lg transition-colors font-medium"
                        style={{
                          color: "var(--text-3)",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        접기
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function StockPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
          <p style={{ color: "var(--text-3)" }}>로딩 중...</p>
        </div>
      }
    >
      <StockContent />
    </Suspense>
  );
}
