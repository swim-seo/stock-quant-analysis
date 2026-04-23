-- theme_signals 테이블: 매일 아침 Claude가 추출한 투자 테마 저장
CREATE TABLE IF NOT EXISTS theme_signals (
  id            BIGSERIAL PRIMARY KEY,
  scanned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  theme_name    TEXT NOT NULL,
  keywords      TEXT[] DEFAULT '{}',
  related_stocks TEXT[] DEFAULT '{}',
  reason        TEXT,
  urgency       TEXT DEFAULT '이번주',
  source_headlines TEXT[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_theme_signals_scanned_at ON theme_signals(scanned_at DESC);
