"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const QUICK_STOCKS: Record<string, string> = {
  삼성전자: "005930.KS",
  "SK하이닉스": "000660.KS",
  현대차: "005380.KS",
  카카오: "035720.KS",
  NAVER: "035420.KS",
};

export function SearchBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Quick stock buttons */}
      <div className="hidden md:flex gap-2">
        {Object.entries(QUICK_STOCKS).map(([name]) => (
          <button
            key={name}
            onClick={() =>
              router.push(`/search?q=${encodeURIComponent(name)}`)
            }
            className="px-3 py-1.5 text-xs rounded-full border border-[#2a2a3e] text-[#7a7a8c] hover:border-[#f0a500] hover:text-[#f0a500] transition-colors"
          >
            {name}
          </button>
        ))}
      </div>

      {/* Search input */}
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="종목명 검색..."
          className="w-48 px-4 py-2 text-sm bg-[#111118] border border-[#2a2a3e] rounded-lg text-white placeholder-[#555] focus:outline-none focus:border-[#f0a500] transition-colors"
        />
      </form>
    </div>
  );
}
