"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InsightsFeed } from "./InsightsFeed";
import { HotSectors } from "./HotSectors";
import { SectorSignals } from "./SectorSignals";
import { searchByStock } from "@/lib/api";
import type { YoutubeInsight } from "@/lib/types";

const POPULAR_STOCKS = ["삼성전자", "SK하이닉스", "현대차", "카카오", "NAVER", "LG에너지솔루션", "셀트리온", "기아", "삼성SDI", "한미반도체"];

function StockSearchPanel() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YoutubeInsight[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = (name: string) => {
    setQuery(name); setLoading(true); setSearched(true);
    searchByStock(name, 10).then(data => { setResults(data); setLoading(false); });
  };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (query.trim()) handleSearch(query.trim()); };

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="종목명을 입력하세요 (예: 삼성전자)"
            style={{ flex: 1, padding: "11px 16px", fontSize: 15, background: "#fff", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text-1)", outline: "none" }} />
          <button type="submit" style={{ padding: "11px 20px", background: "var(--blue)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>검색</button>
        </div>
      </form>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {POPULAR_STOCKS.map(name => (
          <button key={name} onClick={() => handleSearch(name)}
            style={{ padding: "6px 14px", fontSize: 13, borderRadius: 20, border: "1px solid var(--border)", background: "#fff", color: "var(--text-2)", cursor: "pointer", fontWeight: 500 }}>
            {name}
          </button>
        ))}
      </div>

      {query.trim() && (
        <button onClick={() => router.push(`/stock?ticker=${encodeURIComponent(query.trim())}`)}
          style={{ width: "100%", marginBottom: 14, padding: "13px", fontSize: 14, fontWeight: 700, borderRadius: 14, border: "1px solid var(--border)", background: "#fff", color: "var(--blue)", cursor: "pointer" }}>
          📊 &quot;{query.trim()}&quot; 차트 분석 보기 →
        </button>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...Array(3)].map((_, i) => <div key={i} style={{ height: 80, background: "var(--border)", borderRadius: 14 }} className="animate-pulse" />)}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div style={{ background: "#fff", borderRadius: 14, padding: "32px", textAlign: "center" }}>
          <p style={{ fontSize: 15, color: "var(--text-3)" }}>&quot;{query}&quot; 관련 인사이트가 없습니다.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>{results.length}개 결과</p>
          {results.map(item => {
            const sentColor = item.market_sentiment === "긍정" ? "#00b493" : item.market_sentiment === "부정" ? "#f04452" : "#f5a623";
            return (
              <div key={item.video_id} style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                <div style={{ display: "flex", gap: 14, padding: 14 }}>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                    <img src={`https://img.youtube.com/vi/${item.video_id}/mqdefault.jpg`} alt="" style={{ width: 120, height: 72, objectFit: "cover", borderRadius: 10 }} loading="lazy" />
                  </a>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: sentColor, background: `${sentColor}18` }}>{item.market_sentiment}</span>
                      <span style={{ fontSize: 13, color: "var(--text-3)" }}>{item.channel}</span>
                    </div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.4, marginBottom: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</h3>
                    <p style={{ fontSize: 13, color: "var(--text-3)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{item.summary}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                      {(item.key_stocks || []).slice(0, 5).map(s => (
                        <span key={s} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: "#e8f3ff", color: "var(--blue)", fontWeight: 600 }}>{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: "hot", label: "🔥 거래량" },
  { id: "signals", label: "⚡ 타이밍" },
  { id: "search", label: "종목 검색" },
  { id: "insights", label: "인사이트" },
] as const;

type TabId = typeof TABS[number]["id"];

export function MainTabs() {
  const [tab, setTab] = useState<TabId>("hot");

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 20, background: "#fff", padding: 4, borderRadius: 16, boxShadow: "var(--shadow)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "10px 0", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", background: tab === t.id ? "var(--blue)" : "transparent", color: tab === t.id ? "#fff" : "var(--text-3)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "hot" && <HotSectors />}
      {tab === "signals" && <SectorSignals />}
      {tab === "insights" && <InsightsFeed />}
      {tab === "search" && <StockSearchPanel />}
    </div>
  );
}
