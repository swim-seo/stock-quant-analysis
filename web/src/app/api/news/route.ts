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

    if (error) {
      console.error("[api/news] supabase error:", error);
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  // 특정 종목 뉴스 — 입력 검증 (영숫자/온점/^/.KS/.KQ 등만 허용)
  if (!/^[\w.\-^]{1,20}$/.test(stockCode)) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("stock_news")
    .select("*")
    .eq("stock_code", stockCode)
    .order("collected_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[api/news] supabase error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
  return NextResponse.json(data);
}
