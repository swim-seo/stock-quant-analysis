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
  scanned_at: string;
}

const URGENCY_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  오늘:   { color: "#f04452", bg: "#f0445218", label: "오늘" },
  이번주: { color: "#f5a623", bg: "#f5a62318", label: "이번주" },
  중장기: { color: "#4d9fff", bg: "#4d9fff18", label: "중장기" },
};

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
        <p style={{ fontSize: 11, letterSpacing: 2, color: "var(--blue)", fontWeight: 700, marginBottom: 4 }}>TODAY&apos;S THEMES</p>
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>아직 테마 스캔 결과가 없습니다.</p>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "var(--shadow)" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <p style={{ fontSize: 11, letterSpacing: 2, color: "var(--blue)", fontWeight: 700 }}>TODAY&apos;S THEMES</p>
        {scannedAt && (
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            {new Date(scannedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 스캔
          </span>
        )}
      </div>

      {/* 테마 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: ug.color, background: ug.bg, flexShrink: 0 }}>
                  {ug.label}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {theme.theme_name}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-3)", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* 관련 종목 (항상 표시) */}
              {theme.related_stocks.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "0 14px 10px" }}>
                  {theme.related_stocks.slice(0, 6).map((stock) => (
                    <button
                      key={stock}
                      onClick={(e) => { e.stopPropagation(); handleStockClick(stock); }}
                      style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, border: "1px solid var(--border)", background: NAME_TO_TICKER[stock] ? "#e8f3ff" : "#f5f5f5", color: NAME_TO_TICKER[stock] ? "var(--blue)" : "var(--text-2)", fontWeight: 600, cursor: "pointer" }}
                    >
                      {stock}
                    </button>
                  ))}
                </div>
              )}

              {/* 펼쳐지는 상세 */}
              {isOpen && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px", background: "#fafafa" }}>
                  <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 10 }}>{theme.reason}</p>

                  {theme.keywords.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                      {theme.keywords.map((kw) => (
                        <span key={kw} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "#f0f0f8", color: "var(--text-3)" }}>#{kw}</span>
                      ))}
                    </div>
                  )}

                  {theme.source_headlines.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, marginBottom: 5 }}>관련 헤드라인</p>
                      {theme.source_headlines.map((h, i) => (
                        <p key={i} style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, paddingLeft: 8, borderLeft: "2px solid var(--border)", marginBottom: 4 }}>{h}</p>
                      ))}
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
