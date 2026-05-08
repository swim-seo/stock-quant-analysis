import { NextResponse } from "next/server";

const TRIGGER_URL = process.env.PIPELINE_TRIGGER_URL?.replace(/\/$/, "");
const TRIGGER_SECRET = process.env.PIPELINE_TRIGGER_SECRET ?? "";

export async function POST(req: Request) {
  if (!TRIGGER_URL) {
    return NextResponse.json({ error: "PIPELINE_TRIGGER_URL 미설정" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = (body as { mode?: string }).mode ?? "morning";

  try {
    const res = await fetch(`${TRIGGER_URL}/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Trigger-Secret": TRIGGER_SECRET,
      },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  if (!TRIGGER_URL) {
    return NextResponse.json({ running: false, error: "not configured" });
  }
  try {
    const res = await fetch(`${TRIGGER_URL}/status`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ running: false, error: "Railway 서버 응답 없음" });
  }
}
