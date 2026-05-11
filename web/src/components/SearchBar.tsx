"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      <button onClick={() => router.push("/search")}
        style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
        📋 전체종목
      </button>
      <form onSubmit={handleSearch}>
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="종목명 검색..."
          style={{ width: 160, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff", color: "var(--text-1)", fontSize: 14, outline: "none" }} />
      </form>
    </div>
  );
}
