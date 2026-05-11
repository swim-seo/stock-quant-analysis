import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET /api/prediction-log?ticker=005930.KS  — returns accuracy stats
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  // ticker 형식 검증
  if (!/^[\w.\-^]{1,20}$/.test(ticker)) {
    return NextResponse.json({ error: "invalid ticker" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("prediction_log")
    .select("predicted_up, actual_up, correct, date")
    .eq("ticker", ticker)
    .not("correct", "is", null)
    .order("date", { ascending: false })
    .limit(90);

  if (error) {
    console.error("[api/prediction-log] supabase error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  const total = data?.length ?? 0;
  const correct = data?.filter((r) => r.correct).length ?? 0;
  const rate = total > 0 ? Math.round((correct / total) * 1000) / 10 : null;

  return NextResponse.json({ ticker, total, correct, rate, rows: data });
}

// NOTE: POST 라우트 제거됨 (2026-05-11 보안 강화)
// prediction_log 쓰기는 Python 측 railway_job.py가 service-role key로 직접 수행.
// 외부에서 클라이언트가 호출할 정당한 사유 없음.
