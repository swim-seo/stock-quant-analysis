"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

interface Holding {
  ticker: string;
  name: string;
  sector: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
}

interface Trade {
  date: string;
  ticker: string;
  name: string;
  action: "BUY" | "SELL";
  price: number;
  shares: number;
  amount: number;
}

interface DailyValue {
  date: string;
  value: number;
  benchmark: number;
}

interface PortfolioData {
  startDate: string;
  startCapital: number;
  currentValue: number;
  totalReturn: number;
  totalReturnPct: number;
  benchmark: { ticker: string; returnPct: number };
  holdings: Holding[];
  dailyValues: DailyValue[];
  trades: Trade[];
}

function formatKRW(n: number): string {
  if (Math.abs(n) >= 100_000_000) return (n / 100_000_000).toFixed(2) + "억";
  if (Math.abs(n) >= 10_000) return (n / 10_000).toFixed(0) + "만";
  return n.toLocaleString();
}

function MiniChart({ dailyValues }: { dailyValues: DailyValue[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dailyValues.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const allValues = [
      ...dailyValues.map((d) => d.value),
      ...dailyValues.map((d) => d.benchmark),
    ];
    const min = Math.min(...allValues) * 0.998;
    const max = Math.max(...allValues) * 1.002;
    const range = max - min || 1;

    const padLeft = 0;
    const padRight = 0;
    const padTop = 10;
    const padBottom = 20;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    const toX = (i: number) => padLeft + (i / (dailyValues.length - 1)) * chartW;
    const toY = (v: number) => padTop + (1 - (v - min) / range) * chartH;

    // Start capital baseline
    const startY = toY(dailyValues[0].value);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, startY);
    ctx.lineTo(w - padRight, startY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Benchmark line
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    dailyValues.forEach((d, i) => {
      const x = toX(i);
      const y = toY(d.benchmark);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Portfolio line
    const lastValue = dailyValues[dailyValues.length - 1].value;
    const portfolioColor = lastValue >= dailyValues[0].value ? "#ff4444" : "#4488ff";
    ctx.strokeStyle = portfolioColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    dailyValues.forEach((d, i) => {
      const x = toX(i);
      const y = toY(d.value);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, padTop, 0, h - padBottom);
    gradient.addColorStop(0, portfolioColor + "20");
    gradient.addColorStop(1, portfolioColor + "00");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    dailyValues.forEach((d, i) => {
      const x = toX(i);
      const y = toY(d.value);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(toX(dailyValues.length - 1), h - padBottom);
    ctx.lineTo(toX(0), h - padBottom);
    ctx.closePath();
    ctx.fill();

    // Date labels
    ctx.fillStyle = "#555";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(dailyValues.length / 5));
    for (let i = 0; i < dailyValues.length; i += step) {
      ctx.fillText(dailyValues[i].date.slice(5), toX(i), h - 4);
    }
    ctx.fillText(dailyValues[dailyValues.length - 1].date.slice(5), toX(dailyValues.length - 1), h - 4);

    // Legend
    ctx.textAlign = "left";
    ctx.fillStyle = portfolioColor;
    ctx.fillRect(8, 4, 12, 3);
    ctx.fillStyle = "#aaa";
    ctx.font = "9px sans-serif";
    ctx.fillText("내 포트폴리오", 24, 10);

    ctx.fillStyle = "#555";
    ctx.fillRect(100, 4, 12, 3);
    ctx.fillStyle = "#aaa";
    ctx.fillText("코스피", 116, 10);
  }, [dailyValues]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: 220 }}
    />
  );
}

type Tab = "holdings" | "trades";

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("holdings");

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen">
        <header className="border-b border-[#2a2a3a] px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <Link href="/" className="text-[#aaaaaa] hover:text-white transition-colors">
              ← 대시보드
            </Link>
            <h1 className="text-lg font-bold text-white">가상 투자 시뮬레이션</h1>
          </div>
        </header>
        <div className="max-w-5xl mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-[#111118] rounded-xl" />
            <div className="h-56 bg-[#111118] rounded-xl" />
            <div className="h-48 bg-[#111118] rounded-xl" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen">
        <header className="border-b border-[#2a2a3a] px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <Link href="/" className="text-[#aaaaaa] hover:text-white transition-colors">
              ← 대시보드
            </Link>
            <h1 className="text-lg font-bold text-white">가상 투자 시뮬레이션</h1>
          </div>
        </header>
        <div className="max-w-5xl mx-auto p-6">
          <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-8 text-center">
            <p className="text-[#ff4444]">에러: {error || "데이터 로드 실패"}</p>
          </div>
        </div>
      </main>
    );
  }

  const isProfit = data.totalReturn >= 0;
  const returnColor = isProfit ? "#ff4444" : "#4488ff";

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[#2a2a3a] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link href="/" className="text-[#aaaaaa] hover:text-white transition-colors">
            ← 대시보드
          </Link>
          <h1 className="text-lg font-bold text-white">가상 투자 시뮬레이션</h1>
          <span className="text-[10px] text-[#555] ml-auto">
            {data.startDate} ~ 오늘 | 시작 {formatKRW(data.startCapital)}원
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 현재 평가액 */}
          <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-4">
            <p className="text-[10px] text-[#555] mb-1">현재 평가액</p>
            <p className="text-xl font-bold text-white">
              {formatKRW(data.currentValue)}
              <span className="text-xs text-[#555]">원</span>
            </p>
          </div>

          {/* 총 수익 */}
          <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-4">
            <p className="text-[10px] text-[#555] mb-1">총 수익</p>
            <p className="text-xl font-bold" style={{ color: returnColor }}>
              {isProfit ? "+" : ""}{formatKRW(data.totalReturn)}
              <span className="text-xs">원</span>
            </p>
            <p className="text-xs mt-0.5" style={{ color: returnColor }}>
              {isProfit ? "+" : ""}{data.totalReturnPct}%
            </p>
          </div>

          {/* 코스피 대비 */}
          <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-4">
            <p className="text-[10px] text-[#555] mb-1">코스피 수익률</p>
            <p className="text-xl font-bold" style={{
              color: data.benchmark.returnPct >= 0 ? "#ff4444" : "#4488ff"
            }}>
              {data.benchmark.returnPct >= 0 ? "+" : ""}{data.benchmark.returnPct}%
            </p>
          </div>

          {/* 초과 수익 */}
          <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-4">
            <p className="text-[10px] text-[#555] mb-1">초과 수익 (알파)</p>
            {(() => {
              const alpha = data.totalReturnPct - data.benchmark.returnPct;
              const alphaColor = alpha >= 0 ? "#00ff88" : "#ff4444";
              return (
                <p className="text-xl font-bold" style={{ color: alphaColor }}>
                  {alpha >= 0 ? "+" : ""}{alpha.toFixed(2)}%
                </p>
              );
            })()}
          </div>
        </div>

        {/* Chart */}
        <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-4">
          <p className="text-xs text-[#555] mb-2">포트폴리오 가치 추이</p>
          {data.dailyValues.length > 1 ? (
            <MiniChart dailyValues={data.dailyValues} />
          ) : (
            <div className="h-[220px] flex items-center justify-center text-[#555] text-sm">
              아직 데이터가 부족합니다 (최소 2일 필요)
            </div>
          )}
        </div>

        {/* Tabs: Holdings / Trades */}
        <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl">
          <div className="flex border-b border-[#2a2a3a]">
            {(["holdings", "trades"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-3 text-xs font-semibold transition-colors"
                style={{
                  color: tab === t ? "#ffffff" : "#555",
                  borderBottom: tab === t ? "2px solid #ffd700" : "2px solid transparent",
                }}
              >
                {t === "holdings" ? `보유 종목 (${data.holdings.length})` : `거래 내역 (${data.trades.length})`}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "holdings" && (
              data.holdings.length === 0 ? (
                <p className="text-[#555] text-sm text-center py-4">현재 보유 종목 없음 (전량 현금)</p>
              ) : (
                <div className="space-y-2">
                  {data.holdings.map((h) => (
                    <div
                      key={h.ticker}
                      className="flex items-center justify-between py-2 border-b border-[#1a1a2a] last:border-b-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{h.name}</p>
                        <p className="text-[10px] text-[#555]">
                          {h.sector} · {h.shares}주 · 평단 {h.avgPrice.toLocaleString()}원
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-white">{h.currentPrice.toLocaleString()}원</p>
                        <p
                          className="text-xs"
                          style={{ color: h.pnl >= 0 ? "#ff4444" : "#4488ff" }}
                        >
                          {h.pnl >= 0 ? "+" : ""}{formatKRW(h.pnl)}원 ({h.pnl >= 0 ? "+" : ""}{h.pnlPct}%)
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === "trades" && (
              data.trades.length === 0 ? (
                <p className="text-[#555] text-sm text-center py-4">거래 내역 없음</p>
              ) : (
                <div className="space-y-1">
                  {[...data.trades].reverse().map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-[#1a1a2a] last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: t.action === "BUY" ? "#ff444420" : "#4488ff20",
                            color: t.action === "BUY" ? "#ff4444" : "#4488ff",
                          }}
                        >
                          {t.action === "BUY" ? "매수" : "매도"}
                        </span>
                        <span className="text-sm text-white">{t.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#aaa]">
                          {t.shares}주 × {Math.round(t.price).toLocaleString()}원
                        </p>
                        <p className="text-[10px] text-[#555]">{t.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
