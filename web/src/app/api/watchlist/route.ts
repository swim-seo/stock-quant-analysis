import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from("watchlist")
    .select("*")
    .order("priority")
    .order("category");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ticker, stock_name, category, priority, note, avg_price } = body;
  if (!ticker || !stock_name || !category) {
    return NextResponse.json({ error: "ticker, stock_name, category required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("watchlist")
    .upsert({ ticker, stock_name, category, priority: priority ?? 3, note, avg_price, updated_at: new Date().toISOString() }, { onConflict: "ticker" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ticker = searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  const { error } = await supabase.from("watchlist").delete().eq("ticker", ticker);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
