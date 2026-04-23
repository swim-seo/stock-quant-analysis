"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { searchByStock } from "@/lib/api";
import type { YoutubeInsight } from "@/lib/types";
import Link from "next/link";
import { Suspense } from "react";
import { SECTORS, STOCKS_BY_SECTOR, type Sector } from "@/lib/stocks";

const SECTOR_ICONS: Record<string, string> = {
  "반도체": "💾", "2차전지/에너지": "🔋", "바이오": "💊", "자동차": "🚗",
  "IT/플랫폼": "📱", "금융": "🏦", "소재/산업재": "🏭", "조선": "⚓",
  "방산": "🛡️", "원자력": "⚛️", "건설": "🏗️", "우주항공": "🚀",
  "화장품": "💄", "로봇": "🤖", "광통신": "🔆",
  "ETF/국내": "📊", "ETF/해외": "🌏", "ETF/테마": "✨", "지수": "📈", "기타": "📌",
};

const SECTOR_COLORS: Record<string, string> = {
  "반도체": "#e8f3ff", "2차전지/에너지": "#e6fff5", "바이오": "#fff0f5",
  "자동차": "#fff8e6", "IT/플랫폼": "#f0f0ff", "금융": "#e8f5ff",
  "소재/산업재": "#f5f5f5", "조선": "#e6f7ff", "방산": "#fff3e6",
  "원자력": "#f0ffe0", "건설": "#ffe8d0", "우주항공": "#f5e6ff",
  "화장품": "#ffe0f0", "로봇": "#e0f5ff", "광통신": "#f0ffe8",
  "ETF/국내": "#f0f0f0", "ETF/해외": "#e8f0ff", "ETF/테마": "#fff5e0",
};

const CURATED_ORDER: Sector[] = [
  "방산", "조선", "원자력", "우주항공", "반도체",
  "2차전지/에너지", "바이오", "자동차", "로봇", "화장품",
  "광통신", "IT/플랫폼", "금융", "소재/산업재", "건설",
  "ETF/국내", "ETF/해외", "ETF/테마",
];

type StockItem = { ticker: string; name: string; sector: string };

function WatchlistThemes() {
  const router = useRouter();
  const [openSector, setOpenSector] = useState<Sector | null>(null);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
        {CURATED_ORDER.map((sector) => {
          const stocks = STOCKS_BY_SECTOR[sector] || [];
          if (stocks.length === 0) return null;
          const isOpen = openSector === sector;
          const bg = SECTOR_COLORS[sector] || "#f5f5f5";

          return (
            <div key={sector} style={{ gridColumn: isOpen ? "1 / -1" : undefined }}>
              {/* 카드 헤더 */}
              <button
                onClick={() => setOpenSector(isOpen ? null : sector)}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  background: isOpen ? "#fff" : bg,
                  borderRadius: isOpen ? "14px 14px 0 0" : 14,
                  border: isOpen ? "2px solid var(--blue)" : "1.5px solid transparent",
                  cursor: "pointer", textAlign: "left",
                  boxShadow: isOpen ? "0 2px 12px rgba(0,100,255,0.08)" : "0 1px 4px rgba(0,0,0,0.06)",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{SECTOR_ICONS[sector] || "📌"}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isOpen ? "var(--blue)" : "var(--text-1)" }}>
                      {sector}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                      {isOpen
                        ? "▲ 닫기"
                        : stocks.slice(0, 3).map(s => s.name).join(" · ") + (stocks.length > 3 ? ` 외 ${stocks.length - 3}` : "")}
                    </div>
                  </div>
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 8,
                  background: isOpen ? "#dbeeff" : "rgba(255,255,255,0.7)",
                  color: isOpen ? "var(--blue)" : "var(--text-3)",
                  minWidth: 28, textAlign: "center",
                }}>
                  {stocks.length}
                </span>
              </button>

              {/* 종목 펼침 */}
              {isOpen && (
                <div style={{
                  padding: "14px 16px 16px",
                  background: "#fff",
                  borderRadius: "0 0 14px 14px",
                  border: "2px solid var(--blue)",
                  borderTop: "none",
                  boxShadow: "0 4px 16px rgba(0,100,255,0.08)",
                }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {stocks.map((stock) => (
                      <button
                        key={stock.ticker}
                        onClick={() => router.push(`/stock?ticker=${encodeURIComponent(stock.ticker)}`)}
                        style={{
                          padding: "7px 13px", borderRadius: 10,
                          border: "1.5px solid #c8dff8",
                          background: "#f8fbff",
                          cursor: "pointer", textAlign: "left",
                          transition: "all 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#e0f0ff";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--blue)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#f8fbff";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "#c8dff8";
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap" }}>{stock.name}</div>
                        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>{stock.ticker}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FullKrxBrowser() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openSector, setOpenSector] = useState<string | null>(null);
  const [bySector, setBySector] = useState<Record<string, StockItem[]> | null>(null);
  const [loaded, setLoaded] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    if (!loaded) {
      fetch("/api/stocks-list")
        .then((r) => r.json())
        .then((d) => { setBySector(d.bySector); setLoaded(true); })
        .catch(() => {
          const fallback: Record<string, StockItem[]> = {};
          for (const sector of SECTORS) {
            fallback[sector] = STOCKS_BY_SECTOR[sector as Sector] || [];
          }
          setBySector(fallback);
          setLoaded(true);
        });
    }
  };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        style={{
          width: "100%", padding: "14px 20px",
          borderRadius: 14, border: "1.5px dashed var(--border)",
          background: "var(--bg)", cursor: "pointer",
          fontSize: 14, color: "var(--text-3)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        <span>🔍</span>
        <span>KRX 전체 종목 펼치기 (4,500+)</span>
      </button>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: 16, boxShadow: "var(--shadow)", overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>KRX 전체 종목</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-3)" }}>닫기 ▲</button>
      </div>

      {!loaded ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--text-3)" }}>불러오는 중...</p>
        </div>
      ) : bySector && Object.keys(bySector).sort().map((sector, idx) => {
        const isOpen = openSector === sector;
        const stocks = bySector[sector] || [];
        const isLast = idx === Object.keys(bySector).length - 1;

        return (
          <div key={sector}>
            <button
              onClick={() => setOpenSector(isOpen ? null : sector)}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "space-between",
                padding: "13px 20px",
                background: isOpen ? "#f0f7ff" : "#fff",
                border: "none",
                borderBottom: (isOpen || !isLast) ? "1px solid var(--border)" : "none",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>{SECTOR_ICONS[sector] || "📌"}</span>
                <span style={{ fontSize: 13, fontWeight: isOpen ? 700 : 500, color: isOpen ? "var(--blue)" : "var(--text-1)" }}>
                  {sector}
                </span>
                <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 5, background: isOpen ? "#dbeeff" : "var(--bg)", color: isOpen ? "var(--blue)" : "var(--text-3)", fontWeight: 600 }}>
                  {stocks.length}
                </span>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-3)", transform: isOpen ? "rotate(180deg)" : undefined, display: "inline-block" }}>▼</span>
            </button>
            {isOpen && (
              <div style={{ padding: "10px 20px 14px", borderBottom: !isLast ? "1px solid var(--border)" : "none", background: "#f8fbff", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {stocks.map((stock) => (
                  <button
                    key={stock.ticker}
                    onClick={() => router.push(`/stock?ticker=${encodeURIComponent(stock.ticker)}`)}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #c8dff8", background: "#fff", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>{stock.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)" }}>{stock.ticker}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const [results, setResults] = useState<YoutubeInsight[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query) {
      setLoading(true);
      searchByStock(query, 20).then((data) => {
        setResults(data);
        setLoading(false);
      });
    }
  }, [query]);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "16px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" style={{ fontSize: 14, color: "var(--text-3)" }}>← 대시보드</Link>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>
            {query ? `"${query}" 검색 결과` : "종목 탐색"}
          </h1>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        {!query ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>관심 테마</h2>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>{CURATED_ORDER.reduce((n, s) => n + (STOCKS_BY_SECTOR[s]?.length || 0), 0)}종목</span>
            </div>
            <WatchlistThemes />

            <div style={{ margin: "24px 0 12px" }}>
              <FullKrxBrowser />
            </div>
          </>
        ) : loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 16, padding: 16, height: 80 }} className="animate-pulse" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "var(--shadow)" }}>
            <p style={{ fontSize: 14, color: "var(--text-3)" }}>
              &ldquo;{query}&rdquo; 관련 인사이트가 없습니다.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>{results.length}개 결과</p>
            {results.map((item) => {
              let signals: string[] = [];
              try {
                signals = typeof item.investment_signals === "string"
                  ? JSON.parse(item.investment_signals)
                  : item.investment_signals || [];
              } catch { signals = []; }

              const sentColor = item.market_sentiment === "긍정" ? "#00b493" : item.market_sentiment === "부정" ? "#f04452" : "#f5a623";

              return (
                <div key={item.video_id} style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "var(--shadow)" }}>
                  <div style={{ display: "flex", gap: 14 }}>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                      <img
                        src={`https://img.youtube.com/vi/${item.video_id}/mqdefault.jpg`}
                        alt=""
                        style={{ width: 120, height: 72, objectFit: "cover", borderRadius: 10 }}
                        loading="lazy"
                      />
                    </a>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: sentColor, background: `${sentColor}18` }}>
                          {item.market_sentiment}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{item.channel}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{item.trading_type}</span>
                      </div>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.4, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {item.title}
                      </h3>
                      <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                        {item.summary}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: signals.length > 0 ? 6 : 0 }}>
                        {(item.key_stocks || []).map((s) => (
                          <span key={s} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "#e8f3ff", color: "var(--blue)", fontWeight: 600 }}>
                            {s}
                          </span>
                        ))}
                      </div>
                      {signals.slice(0, 2).map((s, i) => (
                        <p key={i} style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>· {s}</p>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 14, color: "var(--text-3)" }}>로딩 중...</p>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
