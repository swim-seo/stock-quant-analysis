import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const revalidate = 300; // 5분 캐시

export async function GET() {
  try {
    // 섹터 현재 지수 + 국면 정보
    const { data: sectors, error } = await supabase
      .from("sector_index")
      .select("sector_code, sector_name, current_index, change_pct, phase, phase_score, trend, updated_at")
      .order("phase_score", { ascending: false });

    if (error) throw error;

    // 섹터별 5주 히스토리
    const { data: history } = await supabase
      .from("sector_index_history")
      .select("sector_code, trade_date, close_index")
      .order("trade_date", { ascending: true });

    const historyBySector: Record<string, number[]> = {};
    for (const row of history || []) {
      if (!historyBySector[row.sector_code]) {
        historyBySector[row.sector_code] = [];
      }
      historyBySector[row.sector_code].push(row.close_index);
    }

    const result = (sectors || []).map((s) => ({
      sector_code: s.sector_code,
      name:        s.sector_name,
      phase:       s.phase || "침체",
      score:       s.phase_score ?? 30,
      change_pct:  s.change_pct ?? 0,
      current_index: s.current_index ?? 0,
      // trend: 저장된 JSON 또는 히스토리에서 계산
      trend: (() => {
        try {
          const stored = typeof s.trend === "string" ? JSON.parse(s.trend) : s.trend;
          if (Array.isArray(stored) && stored.length > 0) return stored.slice(-5);
        } catch {}
        return (historyBySector[s.sector_code] || []).slice(-5);
      })(),
      updated_at: s.updated_at,
    }));

    return NextResponse.json({ sectors: result, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error("[sector-rotation] error:", err);
    return NextResponse.json({ sectors: [], error: "데이터 조회 실패" }, { status: 500 });
  }
}
