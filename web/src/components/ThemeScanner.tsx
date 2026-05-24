"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NAME_TO_TICKER } from "@/lib/stocks";

interface Theme {
  id: number;
  theme_name: string;
  keywords: string[];
  related_stocks: string[];
  reason: string;
  urgency: string;
  source_headlines: string[];
  source_types?: string[];
  confidence_score?: number;
  source_youtube?: string[];
  scanned_at: string;
}

const URGENCY_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  오늘:   { color: "#f04452", bg: "#f0445218", label: "오늘" },
  이번주: { color: "#f5a623", bg: "#f5a62318", label: "이번주" },
  중장기: { color: "#4d9fff", bg: "#4d9fff18", label: "중장기" },
};

function SourceBadge({ types }: { types: string[] }) {
  const hasNews = types.includes("news");
  const hasYT = types.includes("youtube");
  if (hasNews && hasYT) {
    return (
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "#e6f9f2", color: "#00b493", fontWeight: 700 }}>
        📰+📺 양쪽
      </span>
    );
  }
  if (hasYT) {
    return (
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "#fff4e6", color: "#f5a623", fontWeight: 700 }}>
        📺 유튜브
      </span>
    );
  }
  if (hasNews) {
    return (
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "#e8f3ff", color: "#3182f6", fontWeight: 700 }}>
        📰 뉴스
      </span>
    );
  }
  return null;
}

export function ThemeScanner() {
  const router = useRouter();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/themes")
      .then((r) => r.json())
      .then((d) => {
        setThemes(d.themes || []);
        setScannedAt(d.scanned_at || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleStockClick = (name: string) => {
    const ticker = NAME_TO_TICKER[name];
    router.push(`/stock?ticker=${encodeURIComponent(ticker || name)}`);
  };

  if (loading) {
    return (
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "var(--shadow)" }}>
        <div style={{ height: 16, width: "40%", background: "var(--border)", borderRadius: 8, marginBottom: 16 }} className="animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{ height: 64, background: "var(--border)", borderRadius: 12, marginBottom: 8 }} className="animate-pulse" />
        ))}
      </div>
    );
  }

  if (!themes.length) {
    return (
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "var(--shadow)" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>📰📺 오늘의 뉴스 & 유튜브 주목 테마</p>
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>아직 테마 스캔 결과가 없습니다.</p>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "var(--shadow)" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>📰📺 오늘의 뉴스 & 유튜브 주목 테마</p>
        {scannedAt && (
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            {new Date(scannedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 스캔
          </span>
        )}
      </div>

      {/* 테마 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {themes.map((theme) => {
          const ug = URGENCY_STYLE[theme.urgency] ?? URGENCY_STYLE["이번주"];
          const isOpen = expanded === theme.id;

          return (
            <div
              key={theme.id}
              style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", cursor: "pointer" }}
              onClick={() => setExpanded(isOpen ? null : theme.id)}
            >
              {/* 요약 행 */}
              <div style={{ padding: "12px 14px" }}>
                {/* 첫 줄: 뱃지 + 신뢰도 + 화살표 */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 6, color: ug.color, background: ug.bg, flexShrink: 0 }}>
                    {ug.label}
                  </span>
                  {theme.source_types && theme.source_types.length > 0 && (
                    <SourceBadge types={theme.source_types} />
                  )}
                  <span style={{ flex: 1 }} />
                  {typeof theme.confidence_score === "number" && (
                    <span style={{
                      fontSize: 11, color: theme.confidence_score >= 80 ? "#00b493" : theme.confidence_score >= 60 ? "#3182f6" : "#888",
                      fontWeight: 700, flexShrink: 0,
                    }}>
                      신뢰도 {Math.round(theme.confidence_score)}
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: "var(--text-3)", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
                {/* 둘째 줄: 테마 이름 전체 폭 */}
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>
                  {theme.theme_name}
                </span>
              </div>

              {/* 관련 종목 (항상 표시) */}
              {theme.related_stocks.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 12px" }}>
                  {theme.related_stocks.slice(0, 6).map((stock) => (
                    <button
                      key={stock}
                      onClick={(e) => { e.stopPropagation(); handleStockClick(stock); }}
                      style={{ fontSize: 13, padding: "4px 12px", borderRadius: 20, border: "1px solid var(--border)", background: NAME_TO_TICKER[stock] ? "#e8f3ff" : "#f5f5f5", color: NAME_TO_TICKER[stock] ? "var(--blue)" : "var(--text-2)", fontWeight: 600, cursor: "pointer" }}
                    >
                      {stock}
                    </button>
                  ))}
                </div>
              )}

              {/* 펼쳐지는 상세 */}
              {isOpen && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px", background: "#fafafa" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 10 }}>{theme.theme_name}</p>
                  <p style={{ fontSize: 14, color: "#222", lineHeight: 1.7, marginBottom: 12 }}>{theme.reason}</p>

                  {theme.keywords.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                      {theme.keywords.map((kw) => (
                        <span key={kw} style={{ fontSize: 13, padding: "3px 10px", borderRadius: 6, background: "#f0f0f8", color: "var(--text-3)" }}>#{kw}</span>
                      ))}
                    </div>
                  )}

                  {theme.source_headlines.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <p style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginBottom: 6 }}>📰 관련 헤드라인 / 인용</p>
                      {theme.source_headlines.map((h, i) => (
                        <p key={i} style={{ fontSize: 13, color: "#333", lineHeight: 1.6, paddingLeft: 10, borderLeft: "2px solid var(--border)", marginBottom: 6 }}>{h}</p>
                      ))}
                    </div>
                  )}

                  {theme.source_youtube && theme.source_youtube.length > 0 && (
                    <div>
                      <p style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginBottom: 6 }}>📺 출처 채널</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {theme.source_youtube.map((ch, i) => (
                          <span key={i} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 5, background: "#fff4e6", color: "#f5a623", fontWeight: 600 }}>
                            {ch}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
