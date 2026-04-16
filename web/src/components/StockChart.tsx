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

function calcMA(quotes: Quote[], period: number): (number | null)[] {
  return quotes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = quotes.slice(i - period + 1, i + 1);
    return slice.reduce((s, q) => s + q.close, 0) / period;
  });
}

function calcBB(
  quotes: Quote[],
  period = 20,
  mult = 2
): { upper: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < quotes.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = quotes.slice(i - period + 1, i + 1).map((q) => q.close);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(
      slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period
    );
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }
  return { upper, lower };
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

function fmtKRW(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

function fmtVol(n: number) {
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
  const { quotes } = data;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showBB, setShowBB] = useState(false);

  const ma5 = calcMA(quotes, 5);
  const ma20 = calcMA(quotes, 20);
  const ma60 = calcMA(quotes, 60);
  const bb = calcBB(quotes);
  const rsi = calcRSI(quotes);

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
    const H = rect.height;
    const chartH = H * 0.58;
    const rsiH = H * 0.14;
    const volH = H * 0.14;
    const rsiTop = chartH + H * 0.04;
    const volTop = rsiTop + rsiH + H * 0.04;
    const pad = { left: 56, right: 12 };

    const prices = quotes.flatMap((q) => [q.high, q.low]);
    let minP = Math.min(...prices);
    let maxP = Math.max(...prices);

    // Include BB in price range if shown
    if (showBB) {
      bb.upper.forEach((v) => {
        if (v !== null && v > maxP) maxP = v;
      });
      bb.lower.forEach((v) => {
        if (v !== null && v < minP) minP = v;
      });
    }

    const pRange = maxP - minP || 1;
    const maxVol = Math.max(...quotes.map((q) => q.volume));
    const candleW = (W - pad.left - pad.right) / quotes.length;
    const bodyW = Math.max(candleW * 0.6, 1);

    // BG
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "#14141f";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      const price = maxP - (pRange / 4) * i;
      ctx.fillStyle = "#8a8a9a";
      ctx.font = "10px monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmtKRW(price), pad.left - 6, y + 4);
    }

    // Bollinger Bands
    if (showBB) {
      // Fill
      ctx.beginPath();
      let started = false;
      bb.upper.forEach((v, i) => {
        if (v === null) return;
        const x = pad.left + candleW * i + candleW / 2;
        const y = ((maxP - v) / pRange) * chartH;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      for (let i = quotes.length - 1; i >= 0; i--) {
        const v = bb.lower[i];
        if (v === null) continue;
        const x = pad.left + candleW * i + candleW / 2;
        const y = ((maxP - v) / pRange) * chartH;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(160,160,200,0.04)";
      ctx.fill();

      // Lines
      const drawBBLine = (values: (number | null)[]) => {
        ctx.strokeStyle = "rgba(110,110,130,0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        let s = false;
        values.forEach((v, i) => {
          if (v === null) return;
          const x = pad.left + candleW * i + candleW / 2;
          const y = ((maxP - v) / pRange) * chartH;
          if (!s) { ctx.moveTo(x, y); s = true; }
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      };
      drawBBLine(bb.upper);
      drawBBLine(bb.lower);
    }

    // Candles
    quotes.forEach((q, i) => {
      const x = pad.left + candleW * i + candleW / 2;
      const isUp = q.close >= q.open;
      const color = isUp ? "#ef4444" : "#3b82f6";

      const highY = ((maxP - q.high) / pRange) * chartH;
      const lowY = ((maxP - q.low) / pRange) * chartH;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      const openY = ((maxP - q.open) / pRange) * chartH;
      const closeY = ((maxP - q.close) / pRange) * chartH;
      ctx.fillStyle = color;
      ctx.fillRect(
        x - bodyW / 2,
        Math.min(openY, closeY),
        bodyW,
        Math.max(Math.abs(openY - closeY), 1)
      );
    });

    // MA lines
    const drawMA = (values: (number | null)[], color: string, w = 1) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      let s = false;
      values.forEach((v, i) => {
        if (v === null) return;
        const x = pad.left + candleW * i + candleW / 2;
        const y = ((maxP - v) / pRange) * chartH;
        if (!s) { ctx.moveTo(x, y); s = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    drawMA(ma5, "#f97316", 1);
    drawMA(ma20, "#3b82f6", 1.2);
    drawMA(ma60, "#a855f7", 1.2);

    // RSI grid
    ctx.strokeStyle = "#14141f";
    ctx.lineWidth = 0.5;
    [30, 50, 70].forEach((v) => {
      const y = rsiTop + ((100 - v) / 100) * rsiH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = "#8a8a9a";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(v.toString(), pad.left - 6, y + 3);
    });

    // RSI zones
    const y70 = rsiTop + ((100 - 70) / 100) * rsiH;
    const y30 = rsiTop + ((100 - 30) / 100) * rsiH;
    ctx.fillStyle = "rgba(239,68,68,0.04)";
    ctx.fillRect(pad.left, rsiTop, W - pad.left - pad.right, y70 - rsiTop);
    ctx.fillStyle = "rgba(59,130,246,0.04)";
    ctx.fillRect(pad.left, y30, W - pad.left - pad.right, rsiTop + rsiH - y30);

    // RSI line
    ctx.strokeStyle = "#f0a500";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let rsiStarted = false;
    rsi.forEach((v, i) => {
      if (v === null) return;
      const x = pad.left + candleW * i + candleW / 2;
      const y = rsiTop + ((100 - v) / 100) * rsiH;
      if (!rsiStarted) { ctx.moveTo(x, y); rsiStarted = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Volume
    quotes.forEach((q, i) => {
      const x = pad.left + candleW * i + candleW / 2;
      const h = (q.volume / maxVol) * volH;
      ctx.fillStyle =
        q.close >= q.open
          ? "rgba(239,68,68,0.4)"
          : "rgba(59,130,246,0.4)";
      ctx.fillRect(x - bodyW / 2, volTop + volH - h, bodyW, h);
    });

    // Labels
    ctx.fillStyle = "#8a8a9a";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText("RSI", pad.left + 4, rsiTop + 10);
    ctx.fillText("VOL", pad.left + 4, volTop + 10);

    // MA legend
    const ly = 12;
    ctx.font = "10px monospace";
    [
      { l: "MA5", c: "#f97316" },
      { l: "MA20", c: "#3b82f6" },
      { l: "MA60", c: "#a855f7" },
    ].forEach(({ l, c }, i) => {
      const lx = pad.left + 4 + i * 62;
      ctx.fillStyle = c;
      ctx.fillRect(lx, ly - 5, 10, 3);
      ctx.fillText(l, lx + 14, ly);
    });

    // Hover crosshair
    if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < quotes.length) {
      const x = pad.left + candleW * hoveredIdx + candleW / 2;
      ctx.strokeStyle = "rgba(240,165,0,0.3)";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Mouse
    const handleMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const idx = Math.floor((e.clientX - r.left - pad.left) / candleW);
      if (idx >= 0 && idx < quotes.length) setHoveredIdx(idx);
    };
    const handleLeave = () => setHoveredIdx(null);
    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("mouseleave", handleLeave);
    return () => {
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("mouseleave", handleLeave);
    };
  }, [quotes, ma5, ma20, ma60, bb, rsi, showBB, hoveredIdx]);

  const hovered = hoveredIdx !== null ? quotes[hoveredIdx] : null;

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "#0f0f17", border: "1px solid #1a1a2a" }}
    >
      {/* 기간 + BB 토글 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {["3mo", "6mo", "1y", "2y", "3y"].map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className="px-3 py-1 text-[11px] rounded-full border transition-colors"
              style={{
                borderColor: period === p ? "#f0a500" : "#1a1a2a",
                color: period === p ? "#f0a500" : "#6e6e82",
                background: period === p ? "rgba(240,165,0,0.08)" : "transparent",
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowBB(!showBB)}
          className="px-3 py-1 text-[11px] rounded-full border transition-colors"
          style={{
            borderColor: showBB ? "#a855f7" : "#1a1a2a",
            color: showBB ? "#a855f7" : "#6e6e82",
            background: showBB ? "rgba(168,85,247,0.08)" : "transparent",
          }}
        >
          BB
        </button>
      </div>

      {/* Hover tooltip */}
      <div className="h-4 mb-1">
        {hovered && (
          <div
            className="flex gap-3 text-[10px]"
            style={{ fontFamily: "monospace", color: "#6e6e82" }}
          >
            <span style={{ color: "#f0a500" }}>{hovered.date}</span>
            <span>
              O {fmtKRW(hovered.open)} H {fmtKRW(hovered.high)} L{" "}
              {fmtKRW(hovered.low)} C {fmtKRW(hovered.close)}
            </span>
            <span>V {fmtVol(hovered.volume)}</span>
          </div>
        )}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg cursor-crosshair"
        style={{ height: 520, background: "#0a0a0f" }}
      />
    </div>
  );
}
