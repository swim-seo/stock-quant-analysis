"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const QUICK_STOCKS: Record<string, string> = {
  삼성전자: "005930.KS", "SK하이닉스": "000660.KS",
  현대차: "005380.KS", NAVER: "035420.KS",
};

export function SearchBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/stock?ticker=${encodeURIComponent(query.trim())}`);
    } else {
      router.push("/search");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div className="hidden md:flex" style={{ gap: 6 }}>
        {Object.entries(QUICK_STOCKS).map(([name, ticker]) => (
          <button key={name} onClick={() => router.push(`/stock?ticker=${encodeURIComponent(ticker)}`)}
            style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {name}
          </button>
        ))}
        <button onClick={() => router.push("/search")}
          style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          📋 전체종목
        </button>
      </div>
      <form onSubmit={handleSearch}>
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="종목명 검색..."
          style={{ width: 160, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff", color: "var(--text-1)", fontSize: 14, outline: "none" }} />
      </form>
    </div>
  );
}
