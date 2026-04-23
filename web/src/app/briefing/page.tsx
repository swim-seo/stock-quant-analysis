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
  latest_insight_at: string | null;
  generated_at: string | null;
}

function parse<T>(val: string | T): T {
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return val as T; }
  }
  return val;
}

function SignalBadge({ signal }: { signal: string }) {
  const color = signal === "매수관심" ? "#00b493" : signal === "주의" ? "#f04452" : "#f5a623";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color, background: `${color}18` }}>
      {signal}
    </span>
  );
}

function OutlookBadge({ outlook }: { outlook: string }) {
  const color = outlook === "긍정" ? "#00b493" : outlook === "부정" ? "#f04452" : "#f5a623";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color, background: `${color}18` }}>
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
      <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ height: i === 0 ? 40 : 120, background: "var(--border)", borderRadius: 16 }} className="animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!briefing) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 15, color: "var(--text-3)", marginBottom: 16 }}>아직 브리핑이 생성되지 않았습니다.</p>
          <Link href="/" style={{ fontSize: 14, color: "var(--blue)" }}>← 대시보드로</Link>
        </div>
      </main>
    );
  }

  const topStocks = parse<TopStock[]>(briefing.top_stocks);
  const sectorOutlook = parse<SectorOutlook[]>(briefing.sector_outlook);
  const riskAlerts = parse<string[]>(briefing.risk_alerts);
  const investorFlow = parse<Record<string, { foreign_5d: number; institution_5d: number }>>(briefing.investor_flow);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* 헤더 */}
      <header style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "16px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ fontSize: 14, color: "var(--text-3)" }}>← 대시보드</Link>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{briefing.briefing_date}</span>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* 타이틀 */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 11, letterSpacing: 3, color: "var(--blue)", fontWeight: 700, marginBottom: 4 }}>MORNING BRIEFING</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", marginBottom: 4 }}>오늘의 시장 브리핑</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-3)" }}>{briefing.briefing_date} 기준</span>
            {briefing.generated_at && (
              <span style={{ fontSize: 12, color: "#00b493" }}>
                · 생성{" "}
                {new Date(briefing.generated_at).toLocaleString("ko-KR", {
                  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            )}
            {briefing.latest_insight_at && (
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                · 최근 영상{" "}
                {new Date(briefing.latest_insight_at).toLocaleString("ko-KR", {
                  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>

        {/* 시장 요약 */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 2, marginBottom: 12 }}>MARKET SUMMARY</p>
          <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.8, whiteSpace: "pre-line" }}>
            {briefing.market_summary}
          </p>
        </div>

        {/* 주목 종목 + 섹터 전망 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* 주목 종목 */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "var(--shadow)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 2, marginBottom: 14 }}>TOP STOCKS</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.isArray(topStocks) && topStocks.map((stock, i) => (
                <button
                  key={i}
                  onClick={() => router.push(`/stock?ticker=${encodeURIComponent(stock.name)}`)}
                  style={{ width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{stock.name}</span>
                    <SignalBadge signal={stock.signal} />
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: investorFlow[stock.name] ? 6 : 0 }}>{stock.reason}</p>
                  {investorFlow[stock.name] && (
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ fontSize: 11, color: investorFlow[stock.name].foreign_5d >= 0 ? "#f04452" : "var(--blue)" }}>
                        외인 {investorFlow[stock.name].foreign_5d >= 0 ? "+" : ""}{investorFlow[stock.name].foreign_5d.toLocaleString("ko-KR")}
                      </span>
                      <span style={{ fontSize: 11, color: investorFlow[stock.name].institution_5d >= 0 ? "#f04452" : "var(--blue)" }}>
                        기관 {investorFlow[stock.name].institution_5d >= 0 ? "+" : ""}{investorFlow[stock.name].institution_5d.toLocaleString("ko-KR")}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 섹터 전망 */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "var(--shadow)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 2, marginBottom: 14 }}>SECTOR OUTLOOK</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.isArray(sectorOutlook) && sectorOutlook.map((sector, i) => (
                <div key={i} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{sector.sector}</span>
                    <OutlookBadge outlook={sector.outlook} />
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-3)" }}>{sector.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 전문가 종합 의견 */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 2, marginBottom: 12 }}>EXPERT CONSENSUS</p>
          <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.8, whiteSpace: "pre-line" }}>
            {briefing.expert_consensus}
          </p>
        </div>

        {/* 리스크 알림 */}
        {Array.isArray(riskAlerts) && riskAlerts.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "var(--shadow)", borderLeft: "4px solid #f04452" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#f04452", letterSpacing: 2, marginBottom: 12 }}>RISK ALERTS</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {riskAlerts.map((risk, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                  <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>{risk}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 면책 */}
        <p style={{ fontSize: 11, textAlign: "center", color: "var(--text-3)", paddingBottom: 16 }}>
          본 브리핑은 AI가 자동 생성한 참고자료이며, 투자 판단의 근거로 사용할 수 없습니다.
        </p>
      </div>
    </main>
  );
}
