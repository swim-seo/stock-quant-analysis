-- theme_signals 테이블에 public read RLS 정책 추가
-- scripts/theme_signals_migration.sql 에 빠졌던 부분
-- Supabase Dashboard > SQL Editor에서 실행

ALTER TABLE theme_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON theme_signals;
CREATE POLICY "public read" ON theme_signals FOR SELECT USING (true);
