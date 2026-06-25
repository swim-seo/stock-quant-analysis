import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  // 오늘 + 내일 기준으로 최근 후보 조회
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  type Candidate = {
    ticker: string; stock_name: string; close_price: number | null;
    close_hold_score: number | null; next_day_score: number | null;
    reason: string[] | null; risk_flags: string[] | null;
    status: string; final_execution_signal: string | null;
    rejection_reason: string | null; signal_date: string;
    target_date: string; created_at: string; approved_at: string | null;
  };

  const { data } = await supabase
    .from("next_day_candidates")
    .select(
      "ticker,stock_name,close_price,close_hold_score,next_day_score," +
      "reason,risk_flags,status,final_execution_signal,rejection_reason," +
      "signal_date,target_date,created_at,approved_at"
    )
    .gte("target_date", today)
    .order("next_day_score", { ascending: false })
    .limit(30);

  const candidates = (data as Candidate[] | null) ?? [];

  // 상태별 분류
  const approved = candidates.filter(c => c.status === "APPROVED");
  const pending  = candidates.filter(c => c.status === "PENDING");
  const rejected = candidates.filter(c => c.status === "REJECTED");

  return NextResponse.json({
    as_of:    today,
    approved,
    pending,
    rejected,
    total:    candidates.length,
  });
}
