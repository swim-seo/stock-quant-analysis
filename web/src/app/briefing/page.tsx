"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface TopStock {
  name: string;
  reason: string;
  signal: string;
}

interface SectorOutlook {
  sector: string;
  outlook: string;
  reason: string;
}

interface Briefing {
  briefing_date: string;
  market_summary: string;
  top_stocks: string | TopStock[];
  sector_outlook: string | SectorOutlook[];
  expert_consensus: string;
  risk_alerts: string | string[];
  investor_flow: string | Record<string, { foreign_5d: number; institution_5d: number }>;
}

function parse<T>(val: string | T): T {
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return val as T; }
  }
  return val;
}

function SignalBadge({ signal }: { signal: string }) {
  const color = signal === "매수관심" ? "#22c55e" : signal === "주의" ? "#ef4444" : "#f0a500";
  return (
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ color, background: `${color}15`, border: `1px solid ${color}40` }}
    >
      {signal}
    </span>
  );
}

function OutlookBadge({ outlook }: { outlook: string }) {
  const color = outlook === "긍정" ? "#22c55e" : outlook === "부정" ? "#ef4444" : "#f0a500";
  return (
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ color, background: `${color}15` }}
    >
      {outlook}
    </span>
  );
}

export default function BriefingPage() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/briefing")
      .then((r) => r.json())
      .then((d) => { setBriefing(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen">
        <div className="max-w-4xl mx-auto p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-[#1e1e28] rounded w-1/3" />
            <div className="h-40 bg-[#1e1e28] rounded" />
            <div className="h-32 bg-[#1e1e28] rounded" />
          </div>
        </div>
      </main>
    );
  }

  if (!briefing) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-[#8a8a9a] mb-4">아직 브리핑이 생성되지 않았습니다.</p>
          <Link href="/" className="text-sm text-[#f0a500] hover:underline">← 대시보드로</Link>
        </div>
      </main>
    );
  }

  const topStocks = parse<TopStock[]>(briefing.top_stocks);
  const sectorOutlook = parse<SectorOutlook[]>(briefing.sector_outlook);
  const riskAlerts = parse<string[]>(briefing.risk_alerts);
  const investorFlow = parse<Record<string, { foreign_5d: number; institution_5d: number }>>(briefing.investor_flow);

  return (
    <main className="min-h-screen">
      {/* 헤더 */}
      <header className="border-b border-[#1e1e28] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-sm text-[#8a8a9a] hover:text-white transition-colors">
            ← 대시보드
          </Link>
          <span className="text-xs text-[#555568]">{briefing.briefing_date}</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* 타이틀 */}
        <div>
          <p className="text-[11px] tracking-[3px] text-[#f0a500] font-bold mb-2">MORNING BRIEFING</p>
          <h1 className="text-2xl font-bold text-white">오늘의 시장 브리핑</h1>
          <p className="text-sm text-[#8a8a9a] mt-1">{briefing.briefing_date} 기준</p>
        </div>

        {/* 시장 요약 */}
        <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-6">
          <h2 className="text-xs font-semibold text-[#8a8a9a] tracking-widest mb-3">MARKET SUMMARY</h2>
          <p className="text-sm text-[#d0d0d8] leading-relaxed whitespace-pre-line">
            {briefing.market_summary}
          </p>
        </div>

        {/* 주목 종목 + 섹터 전망 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 주목 종목 */}
          <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-6">
            <h2 className="text-xs font-semibold text-[#8a8a9a] tracking-widest mb-4">TOP STOCKS</h2>
            <div className="space-y-3">
              {Array.isArray(topStocks) && topStocks.map((stock, i) => (
                <button
                  key={i}
                  onClick={() => router.push(`/stock?ticker=${encodeURIComponent(stock.name)}`)}
                  className="w-full text-left rounded-lg p-3 hover:bg-[#1a1a2a] transition-colors"
                  style={{ background: "#0a0a12" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-white">{stock.name}</span>
                    <SignalBadge signal={stock.signal} />
                  </div>
                  <p className="text-xs text-[#8a8a9a]">{stock.reason}</p>
                  {investorFlow[stock.name] && (
                    <div className="flex gap-3 mt-1.5 text-[11px]">
                      <span style={{ color: investorFlow[stock.name].foreign_5d >= 0 ? "#ef4444" : "#3b82f6" }}>
                        외인 {investorFlow[stock.name].foreign_5d >= 0 ? "+" : ""}{investorFlow[stock.name].foreign_5d.toLocaleString("ko-KR")}
                      </span>
                      <span style={{ color: investorFlow[stock.name].institution_5d >= 0 ? "#ef4444" : "#3b82f6" }}>
                        기관 {investorFlow[stock.name].institution_5d >= 0 ? "+" : ""}{investorFlow[stock.name].institution_5d.toLocaleString("ko-KR")}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 섹터 전망 */}
          <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-6">
            <h2 className="text-xs font-semibold text-[#8a8a9a] tracking-widest mb-4">SECTOR OUTLOOK</h2>
            <div className="space-y-3">
              {Array.isArray(sectorOutlook) && sectorOutlook.map((sector, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: "#0a0a12" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-white">{sector.sector}</span>
                    <OutlookBadge outlook={sector.outlook} />
                  </div>
                  <p className="text-xs text-[#8a8a9a]">{sector.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 전문가 종합 의견 */}
        <div className="bg-[#111118] border border-[#1e1e28] rounded-xl p-6">
          <h2 className="text-xs font-semibold text-[#8a8a9a] tracking-widest mb-3">EXPERT CONSENSUS</h2>
          <p className="text-sm text-[#d0d0d8] leading-relaxed whitespace-pre-line">
            {briefing.expert_consensus}
          </p>
        </div>

        {/* 리스크 알림 */}
        {Array.isArray(riskAlerts) && riskAlerts.length > 0 && (
          <div className="bg-[#111118] border border-[#ef444430] rounded-xl p-6">
            <h2 className="text-xs font-semibold text-[#ef4444] tracking-widest mb-3">RISK ALERTS</h2>
            <div className="space-y-2">
              {riskAlerts.map((risk, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-sm">⚠️</span>
                  <p className="text-sm text-[#d0d0d8]">{risk}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 면책 */}
        <p className="text-[11px] text-center text-[#555568] pb-4">
          본 브리핑은 AI가 자동 생성한 참고자료이며, 투자 판단의 근거로 사용할 수 없습니다.
        </p>
      </div>
    </main>
  );
}
