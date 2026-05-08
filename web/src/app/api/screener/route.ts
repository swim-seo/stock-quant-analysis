import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 1800;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const sector = req.nextUrl.searchParams.get("sector") ?? "";

  let query = supabase
    .from("factor_scores")
    .select("*")
    .order("composite_score", { ascending: false })
    .limit(200);

  if (sector) query = query.eq("sector", sector);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
