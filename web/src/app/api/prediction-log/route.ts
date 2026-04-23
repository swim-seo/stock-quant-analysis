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

  const { data, error } = await supabase
    .from("prediction_log")
    .select("predicted_up, actual_up, correct, date")
    .eq("ticker", ticker)
    .not("correct", "is", null)
    .order("date", { ascending: false })
    .limit(90);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = data?.length ?? 0;
  const correct = data?.filter((r) => r.correct).length ?? 0;
  const rate = total > 0 ? Math.round((correct / total) * 1000) / 10 : null;

  return NextResponse.json({ ticker, total, correct, rate, rows: data });
}

// POST /api/prediction-log  — save today's prediction
// body: { ticker, predicted_up, probability }
export async function POST(req: Request) {
  const body = await req.json();
  const { ticker, predicted_up, probability } = body;
  if (!ticker || predicted_up === undefined || probability === undefined) {
    return NextResponse.json({ error: "ticker, predicted_up, probability required" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("prediction_log").upsert(
    { date: today, ticker, predicted_up, probability },
    { onConflict: "date,ticker" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, date: today, ticker });
}
