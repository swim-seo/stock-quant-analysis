"use client";

import { useEffect, useState } from "react";
import { getMarketSentiment } from "@/lib/api";
import type { MarketSentiment } from "@/lib/types";

export function SentimentCard() {
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);

  useEffect(() => {
    getMarketSentiment().then(setSentiment);
  }, []);

  if (!sentiment) {
    return (
      <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-[#1e1e28] rounded w-1/3 mb-4" />
        <div className="h-8 bg-[#1e1e28] rounded w-1/2" />
      </div>
    );
  }

  const scoreColor =
    sentiment.label === "긍정"
      ? "#00c853"
      : sentiment.label === "부정"
        ? "#ff1744"
        : "#ffab00";

  const gaugePercent = ((sentiment.score + 1) / 2) * 100;

  return (
    <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-6">
      <h2 className="text-xs font-semibold text-[#7a7a8c] tracking-widest mb-4">
        시장 심리 지수
      </h2>

      {/* Score */}
      <div className="flex items-end gap-3 mb-4">
        <span className="text-4xl font-bold" style={{ color: scoreColor }}>
          {sentiment.score > 0 ? "+" : ""}
          {sentiment.score}
        </span>
        <span
          className="text-sm font-semibold px-2 py-0.5 rounded-full mb-1"
          style={{
            backgroundColor: `${scoreColor}15`,
            color: scoreColor,
          }}
        >
          {sentiment.label}
        </span>
      </div>

      {/* Gauge bar */}
      <div className="h-2 bg-[#1e1e28] rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${gaugePercent}%`,
            background: `linear-gradient(90deg, #ff1744, #ffab00, #00c853)`,
          }}
        />
      </div>

      {/* Details */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-bold text-[#00c853]">
            {sentiment.details.긍정}
          </div>
          <div className="text-[10px] text-[#7a7a8c]">긍정</div>
        </div>
        <div>
          <div className="text-lg font-bold text-[#ffab00]">
            {sentiment.details.중립}
          </div>
          <div className="text-[10px] text-[#7a7a8c]">중립</div>
        </div>
        <div>
          <div className="text-lg font-bold text-[#ff1744]">
            {sentiment.details.부정}
          </div>
          <div className="text-[10px] text-[#7a7a8c]">부정</div>
        </div>
      </div>

      <div className="mt-3 text-[10px] text-[#555]">
        최근 {sentiment.count}개 영상 기준
      </div>
    </div>
  );
}
