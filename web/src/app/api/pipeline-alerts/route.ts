import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  // 알림 해결 처리: PATCH /api/pipeline-alerts  body: { id: number }
  const { id } = await req.json();
  const { error } = await supabase
    .from('pipeline_alerts')
    .update({ resolved: true })
    .eq('id', id);

  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
