import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const [briefingRes, insightRes] = await Promise.all([
    supabase
      .from("morning_briefing")
      .select("*")
      .order("briefing_date", { ascending: false })
      .limit(1),
    supabase
      .from("youtube_insights")
      .select("processed_at")
      .order("processed_at", { ascending: false })
      .limit(1),
  ]);

  if (briefingRes.error) return NextResponse.json({ error: briefingRes.error.message }, { status: 500 });
  if (!briefingRes.data || briefingRes.data.length === 0) return NextResponse.json(null);

  const row = briefingRes.data[0];
  let generatedAt: string | null = null;
  try {
    const raw = typeof row.raw_data === "string" ? JSON.parse(row.raw_data) : row.raw_data;
    generatedAt = raw?.generated_at ?? null;
  } catch { /* ignore */ }

  return NextResponse.json({
    ...row,
    generated_at: generatedAt,
    latest_insight_at: insightRes.data?.[0]?.processed_at ?? null,
  });
}
