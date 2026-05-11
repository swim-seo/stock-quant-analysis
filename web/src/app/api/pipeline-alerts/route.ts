import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALLOWED_HOSTS = new Set([
  "web-beryl-eight-90.vercel.app",
  "localhost",
  "127.0.0.1",
]);

function originAllowed(req: Request): boolean {
  const source = req.headers.get("origin") || req.headers.get("referer");
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

export async function GET() {
  // 최근 7일 미해결 알림
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('pipeline_alerts')
    .select('id, created_at, mode, step, diagnosis, resolved')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ alerts: [] });
  return NextResponse.json({ alerts: data ?? [] });
}

export async function PATCH(req: Request) {
  // CSRF 방지: 같은 도메인 요청만 허용
  if (!originAllowed(req)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = (body as { id?: unknown }).id;

  // id 검증 — 양의 정수만 허용
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  const { error } = await supabase
    .from('pipeline_alerts')
    .update({ resolved: true })
    .eq('id', id);

  if (error) {
    console.error("[api/pipeline-alerts] update failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
