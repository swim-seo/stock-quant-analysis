import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 1800;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const sector = req.nextUrl.searchParams.get("sector") ?? "";

  // sector 입력 검증 — 한글/영어/슬래시/공백만 (길이 30 이하)
  if (sector && (sector.length > 30 || !/^[\w가-힣/\s.&]+$/.test(sector))) {
    return NextResponse.json({ error: "invalid sector" }, { status: 400 });
  }

  let query = supabase
    .from("factor_scores")
    .select("*")
    .order("composite_score", { ascending: false })
    .limit(200);

  if (sector) query = query.eq("sector", sector);

  const { data, error } = await query;

  if (error) {
    console.error("[api/screener] supabase error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
