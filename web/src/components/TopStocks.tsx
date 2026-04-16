"use client";

import { useEffect, useState } from "react";
import { getTopMentionedStocks } from "@/lib/api";

export function TopStocks() {
  const [stocks, setStocks] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopMentionedStocks(7, 10).then((data) => {
      setStocks(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-[#2a2a3a] rounded w-1/2 mb-4" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-6 bg-[#2a2a3a] rounded mb-2" />
        ))}
      </div>
    );
  }

  const maxCount = stocks[0]?.count || 1;

  return (
    <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-6">
      <h2 className="text-xs font-semibold text-[#aaaaaa] tracking-widest mb-4">
        종목 언급 빈도 TOP 10
      </h2>

      {stocks.length === 0 ? (
        <p className="text-sm text-[#555]">데이터 없음</p>
      ) : (
        <div className="space-y-2">
          {stocks.map((stock, i) => (
            <div key={stock.name} className="flex items-center gap-3">
              <span className="text-xs text-[#555] w-5 text-right">
                {i + 1}
              </span>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-white">{stock.name}</span>
                  <span className="text-xs text-[#aaaaaa]">
                    {stock.count}회
                  </span>
                </div>
                <div className="h-1 bg-[#2a2a3a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#4d9fff] transition-all duration-500"
                    style={{
                      width: `${(stock.count / maxCount) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-[#555]">최근 7일 기준</div>
    </div>
  );
}
