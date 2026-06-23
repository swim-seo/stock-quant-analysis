import { NextResponse } from "next/server";

const TRIGGER_URL = process.env.PIPELINE_TRIGGER_URL?.replace(/\/$/, "");
const TRIGGER_SECRET = process.env.PIPELINE_TRIGGER_SECRET ?? "";

const VALID_MODES = new Set(["morning", "afternoon", "all", "prices"]);
const ALLOWED_HOSTS = new Set([
  "web-beryl-eight-90.vercel.app",
  "localhost",
  "127.0.0.1",
]);

function originAllowed(req: Request): boolean {
  // Same-origin POSTs from our Vercel deployments only. Block cross-site requests.
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const source = origin || referer;
  if (!source) return false;
  try {
    const url = new URL(source);
    if (ALLOWED_HOSTS.has(url.hostname)) return true;
    if (url.hostname.endsWith(".vercel.app")) return true;
    return false;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!TRIGGER_URL || !TRIGGER_SECRET) {
    return NextResponse.json(
      { error: "파이프라인 트리거 미설정" },
      { status: 503 }
    );
  }

  if (!originAllowed(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = (body as { mode?: string }).mode ?? "morning";
  if (!VALID_MODES.has(mode)) {
    return NextResponse.json({ error: "invalid mode" }, { status: 400 });
  }

  try {
    const res = await fetch(`${TRIGGER_URL}/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Trigger-Secret": TRIGGER_SECRET,
      },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    // 에러 메시지를 클라이언트에 노출하지 않음 (내부 URL/스택 등 노출 방지)
    console.error("[trigger-pipeline] fetch failed:", e);
    return NextResponse.json(
      { error: "upstream unavailable" },
      { status: 502 }
    );
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
  } catch (e) {
    console.error("[trigger-pipeline GET] failed:", e);
    return NextResponse.json({ running: false, error: "Railway 응답 없음" });
  }
}
