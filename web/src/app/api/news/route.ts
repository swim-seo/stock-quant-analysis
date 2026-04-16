import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stockCode = searchParams.get("code");

  if (!stockCode) {
    // 전체 종목 최신 뉴스
    const { data, error } = await supabase
      .from("stock_news")
      .select("*")
      .order("collected_at", { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // 특정 종목 뉴스
  const { data, error } = await supabase
    .from("stock_news")
    .select("*")
    .eq("stock_code", stockCode)
    .order("collected_at", { ascending: false })
    .limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
