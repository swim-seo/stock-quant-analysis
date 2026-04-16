import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from("morning_briefing")
    .select("*")
    .order("briefing_date", { ascending: false })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json(null);
  return NextResponse.json(data[0]);
}
