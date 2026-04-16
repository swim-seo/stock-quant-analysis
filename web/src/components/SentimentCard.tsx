"use client";

import { useEffect, useState } from "react";

interface Component {
  score: number;
  label: string;
  detail: string;
}

interface SectorItem {
  name: string;
  score: number;
  label: "긍정" | "중립" | "부정";
  긍정: number;
  중립: number;
  부정: number;
  total: number;
}

interface FearGreedData {
  score: number;
  label: string;
  components: {
    volatility: Component;
    momentum: Component;
    volume: Component;
    usFearGreed: Component;
    youtube: Component;
  };
  sectors: SectorItem[];
}

type Tab = "feargreed" | "sector";

function getColor(score: number) {
  if (score >= 81) return "#00c853";
  if (score >= 61) return "#6bcb77";
  if (score >= 41) return "#ffab00";
  if (score >= 21) return "#ff6b6b";
  return "#ff1744";
}

function getSectorColor(label: string) {
  if (label === "긍정") return "#00c853";
  if (label === "부정") return "#ff1744";
  return "#ffab00";
}

const COMP_LABELS: Record<string, string> = {
  volatility: "코스피 변동성",
  momentum: "코스피 모멘텀",
  volume: "거래량 모멘텀",
  usFearGreed: "미국 F&G",
  youtube: "유튜브 심리",
};

export function SentimentCard() {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [tab, setTab] = useState<Tab>("feargreed");

  useEffect(() => {
    fetch("/api/fear-greed")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-[#1e1e28] rounded w-1/3 mb-4" />
        <div className="h-12 bg-[#1e1e28] rounded w-1/2 mx-auto mb-4" />
        <div className="h-2 bg-[#1e1e28] rounded mb-3" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-6 bg-[#1e1e28] rounded" />
          ))}
        </div>
      </div>
    );
  }

  const color = getColor(data.score);

  return (
    <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-6">
      {/* 탭 버튼 */}
      <div className="flex gap-1 mb-5">
        <button
          onClick={() => setTab("feargreed")}
          className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-colors"
          style={{
            background: tab === "feargreed" ? "#1e1e28" : "transparent",
            color: tab === "feargreed" ? "#e8e8f0" : "#555568",
          }}
        >
          공포탐욕 지수
        </button>
        <button
          onClick={() => setTab("sector")}
          className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-colors"
          style={{
            background: tab === "sector" ? "#1e1e28" : "transparent",
            color: tab === "sector" ? "#e8e8f0" : "#555568",
          }}
        >
          섹터별 심리
        </button>
      </div>

      {tab === "feargreed" ? (
        <>
          {/* 점수 */}
          <div className="text-center mb-4">
            <div className="text-5xl font-extrabold leading-none" style={{ color }}>
              {data.score.toFixed(0)}
            </div>
            <div className="text-sm font-semibold mt-2" style={{ color }}>
              {data.label}
            </div>
          </div>

          {/* 게이지 바 */}
          <div className="h-2 bg-[#1e1e28] rounded-full overflow-hidden mb-1">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${data.score}%`,
                background: "linear-gradient(90deg, #ff1744, #ff6b6b, #ffab00, #6bcb77, #00c853)",
              }}
            />
          </div>
          <div className="flex justify-between text-[11px] mb-5" style={{ color: "#555568" }}>
            <span>극도공포</span>
            <span>공포</span>
            <span>중립</span>
            <span>탐욕</span>
            <span>극도탐욕</span>
          </div>

          {/* 구성 요소 */}
          <div className="space-y-2.5">
            {Object.entries(data.components).map(([key, comp]) => {
              const compColor = getColor(comp.score * 5);
              const barW = (comp.score / 20) * 100;
              return (
                <div key={key}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span style={{ color: "#8a8a9a" }}>{COMP_LABELS[key] || key}</span>
                    <span className="font-semibold" style={{ color: compColor }}>
                      {comp.score.toFixed(0)}/20
                    </span>
                  </div>
                  <div className="h-1 bg-[#1e1e28] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barW}%`, background: compColor }}
                    />
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "#555568" }}>
                    {comp.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* 섹터별 심리 */
        <>
          <div className="text-xs mb-3" style={{ color: "#8a8a9a" }}>
            최근 영상 기준 · 3회 이상 언급 섹터
          </div>
          {data.sectors.length === 0 ? (
            <div className="text-center py-6 text-xs" style={{ color: "#555568" }}>
              섹터 데이터 없음
            </div>
          ) : (
            <div className="space-y-2">
              {data.sectors.map((sector) => {
                const sColor = getSectorColor(sector.label);
                const posW = sector.total > 0 ? (sector.긍정 / sector.total) * 100 : 0;
                const neuW = sector.total > 0 ? (sector.중립 / sector.total) * 100 : 0;
                const negW = sector.total > 0 ? (sector.부정 / sector.total) * 100 : 0;
                return (
                  <div
                    key={sector.name}
                    className="rounded-lg p-3"
                    style={{ background: "#0a0a12", border: "1px solid #1e1e28" }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold" style={{ color: "#e8e8f0" }}>
                        {sector.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: sColor, background: `${sColor}15` }}
                        >
                          {sector.label}
                        </span>
                        <span className="text-[11px]" style={{ color: "#555568" }}>
                          {sector.total}건
                        </span>
                      </div>
                    </div>
                    {/* 스택 바 */}
                    <div className="h-1.5 rounded-full overflow-hidden flex">
                      {posW > 0 && (
                        <div style={{ width: `${posW}%`, background: "#00c853" }} className="h-full" />
                      )}
                      {neuW > 0 && (
                        <div style={{ width: `${neuW}%`, background: "#ffab00" }} className="h-full" />
                      )}
                      {negW > 0 && (
                        <div style={{ width: `${negW}%`, background: "#ff1744" }} className="h-full" />
                      )}
                    </div>
                    <div className="flex gap-3 mt-1.5 text-[11px]" style={{ color: "#8a8a9a" }}>
                      <span>긍정 {sector.긍정}</span>
                      <span>중립 {sector.중립}</span>
                      <span>부정 {sector.부정}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
