"use client";

import { useEffect, useRef, useState } from "react";

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

// 기술 지표 계산
function calcMA(quotes: Quote[], period: number): (number | null)[] {
  return quotes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = quotes.slice(i - period + 1, i + 1);
    return slice.reduce((s, q) => s + q.close, 0) / period;
  });
}

function calcRSI(quotes: Quote[], period: number = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(quotes.length).fill(null);
  if (quotes.length < period + 1) return rsi;

  let gainSum = 0;
  let lossSum = 0;
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
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function formatKRW(n: number): string {
  return n.toLocaleString("ko-KR");
}

function formatVolume(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

export function StockChart({
  data,
  period,
  onPeriodChange,
}: {
  data: StockData;
  period: string;
  onPeriodChange: (p: string) => void;
}) {
  const { quotes, name, ticker } = data;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const ma5 = calcMA(quotes, 5);
  const ma20 = calcMA(quotes, 20);
  const ma60 = calcMA(quotes, 60);
  const rsi = calcRSI(quotes);

  const latest = quotes[quotes.length - 1];
  const prev = quotes[quotes.length - 2];
  const change = latest.close - prev.close;
  const changePct = (change / prev.close) * 100;
  const latestRSI = rsi[rsi.length - 1];

  // Canvas chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || quotes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const chartH = rect.height * 0.55;
    const rsiH = rect.height * 0.15;
    const volH = rect.height * 0.15;
    const rsiTop = chartH + rect.height * 0.05;
    const volTop = rsiTop + rsiH + rect.height * 0.05;
    const pad = { left: 60, right: 20 };

    // Data ranges
    const prices = quotes.flatMap((q) => [q.high, q.low]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const pRange = maxP - minP || 1;
    const maxVol = Math.max(...quotes.map((q) => q.volume));

    const candleW = (W - pad.left - pad.right) / quotes.length;
    const bodyW = Math.max(candleW * 0.6, 1);

    // Background
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, W, rect.height);

    // Grid lines
    ctx.strokeStyle = "#1e1e28";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      // Price label
      const price = maxP - (pRange / 4) * i;
      ctx.fillStyle = "#555";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(formatKRW(Math.round(price)), pad.left - 5, y + 4);
    }

    // Candles
    quotes.forEach((q, i) => {
      const x = pad.left + candleW * i + candleW / 2;
      const isUp = q.close >= q.open;
      const color = isUp ? "#ef5350" : "#26a69a";

      // Wick
      const highY = ((maxP - q.high) / pRange) * chartH;
      const lowY = ((maxP - q.low) / pRange) * chartH;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const openY = ((maxP - q.open) / pRange) * chartH;
      const closeY = ((maxP - q.close) / pRange) * chartH;
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(Math.abs(openY - closeY), 1);
      ctx.fillStyle = color;
      ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyHeight);
    });

    // Moving averages
    const drawMA = (values: (number | null)[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      values.forEach((v, i) => {
        if (v === null) return;
        const x = pad.left + candleW * i + candleW / 2;
        const y = ((maxP - v) / pRange) * chartH;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    };

    drawMA(ma5, "#ff9800");
    drawMA(ma20, "#2196f3");
    drawMA(ma60, "#9c27b0");

    // RSI
    ctx.strokeStyle = "#1e1e28";
    ctx.lineWidth = 0.5;
    [30, 50, 70].forEach((v) => {
      const y = rsiTop + ((100 - v) / 100) * rsiH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      ctx.fillStyle = "#555";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(v.toString(), pad.left - 5, y + 3);
    });

    // RSI 70 / 30 zones
    const y70 = rsiTop + ((100 - 70) / 100) * rsiH;
    const y30 = rsiTop + ((100 - 30) / 100) * rsiH;
    ctx.fillStyle = "rgba(255,23,68,0.05)";
    ctx.fillRect(pad.left, rsiTop, W - pad.left - pad.right, y70 - rsiTop);
    ctx.fillStyle = "rgba(33,150,243,0.05)";
    ctx.fillRect(pad.left, y30, W - pad.left - pad.right, rsiTop + rsiH - y30);

    ctx.strokeStyle = "#ff9800";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let rsiStarted = false;
    rsi.forEach((v, i) => {
      if (v === null) return;
      const x = pad.left + candleW * i + candleW / 2;
      const y = rsiTop + ((100 - v) / 100) * rsiH;
      if (!rsiStarted) {
        ctx.moveTo(x, y);
        rsiStarted = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Volume
    quotes.forEach((q, i) => {
      const x = pad.left + candleW * i + candleW / 2;
      const h = (q.volume / maxVol) * volH;
      const isUp = q.close >= q.open;
      ctx.fillStyle = isUp ? "rgba(239,83,80,0.5)" : "rgba(38,166,154,0.5)";
      ctx.fillRect(x - bodyW / 2, volTop + volH - h, bodyW, h);
    });

    // Labels
    ctx.fillStyle = "#555";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("RSI", pad.left + 5, rsiTop + 12);
    ctx.fillText("거래량", pad.left + 5, volTop + 12);

    // MA Legend
    const legendY = 14;
    ctx.font = "10px sans-serif";
    [
      { label: "MA5", color: "#ff9800" },
      { label: "MA20", color: "#2196f3" },
      { label: "MA60", color: "#9c27b0" },
    ].forEach(({ label, color }, i) => {
      const lx = pad.left + 5 + i * 65;
      ctx.fillStyle = color;
      ctx.fillRect(lx, legendY - 6, 12, 3);
      ctx.fillText(label, lx + 16, legendY);
    });

    // Hover handler
    const handleMouseMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const idx = Math.floor((mx - pad.left) / candleW);
      if (idx >= 0 && idx < quotes.length) {
        setHoveredIdx(idx);
      }
    };
    const handleMouseLeave = () => setHoveredIdx(null);

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [quotes, ma5, ma20, ma60, rsi]);

  const hovered = hoveredIdx !== null ? quotes[hoveredIdx] : null;

  return (
    <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">{name}</h2>
          <p className="text-xs text-[#7a7a8c]">{ticker}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">
            {formatKRW(Math.round(latest.close))}
            <span className="text-xs text-[#7a7a8c] ml-1">원</span>
          </p>
          <p
            className="text-sm font-semibold"
            style={{ color: change >= 0 ? "#ef5350" : "#26a69a" }}
          >
            {change >= 0 ? "+" : ""}
            {formatKRW(Math.round(change))}원 ({changePct >= 0 ? "+" : ""}
            {changePct.toFixed(2)}%)
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-[#0a0a12] rounded-lg p-3 text-center">
          <p className="text-[10px] text-[#7a7a8c]">RSI</p>
          <p
            className="text-lg font-bold"
            style={{
              color:
                latestRSI && latestRSI > 70
                  ? "#ff1744"
                  : latestRSI && latestRSI < 30
                    ? "#2196f3"
                    : "#ffab00",
            }}
          >
            {latestRSI?.toFixed(1) || "-"}
          </p>
          <p className="text-[9px] text-[#555]">
            {latestRSI && latestRSI > 70
              ? "과매수"
              : latestRSI && latestRSI < 30
                ? "과매도"
                : "중립"}
          </p>
        </div>
        <div className="bg-[#0a0a12] rounded-lg p-3 text-center">
          <p className="text-[10px] text-[#7a7a8c]">거래량</p>
          <p className="text-lg font-bold text-white">
            {formatVolume(latest.volume)}
          </p>
        </div>
        <div className="bg-[#0a0a12] rounded-lg p-3 text-center">
          <p className="text-[10px] text-[#7a7a8c]">고가</p>
          <p className="text-lg font-bold text-[#ef5350]">
            {formatKRW(Math.round(latest.high))}
          </p>
        </div>
        <div className="bg-[#0a0a12] rounded-lg p-3 text-center">
          <p className="text-[10px] text-[#7a7a8c]">저가</p>
          <p className="text-lg font-bold text-[#26a69a]">
            {formatKRW(Math.round(latest.low))}
          </p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-4">
        {["3mo", "6mo", "1y", "2y", "3y"].map((p) => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              period === p
                ? "border-[#f0a500] text-[#f0a500] bg-[#f0a50010]"
                : "border-[#2a2a3e] text-[#7a7a8c] hover:border-[#555]"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="flex gap-4 text-[10px] text-[#7a7a8c] mb-2">
          <span>{hovered.date}</span>
          <span>
            시 {formatKRW(Math.round(hovered.open))} | 고{" "}
            {formatKRW(Math.round(hovered.high))} | 저{" "}
            {formatKRW(Math.round(hovered.low))} | 종{" "}
            {formatKRW(Math.round(hovered.close))}
          </span>
          <span>거래량 {formatVolume(hovered.volume)}</span>
        </div>
      )}

      {/* Canvas chart */}
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg cursor-crosshair"
        style={{ height: 450 }}
      />
    </div>
  );
}
