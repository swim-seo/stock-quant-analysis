import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const revalidate = 300;

export async function GET() {
  // 가장 최근 스캔 배치의 scanned_at 조회
  const { data: latest } = await supabase
    .from("theme_signals")
    .select("scanned_at")
    .order("scanned_at", { ascending: false })
    .limit(1);

  if (!latest || latest.length === 0) {
    return NextResponse.json({ themes: [], scanned_at: null });
  }

  const latestAt = latest[0].scanned_at;

  // 같은 배치(±5분)의 모든 테마 조회
  const since = new Date(new Date(latestAt).getTime() - 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("theme_signals")
    .select("*")
    .gte("scanned_at", since)
    .order("scanned_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ themes: data || [], scanned_at: latestAt });
}
