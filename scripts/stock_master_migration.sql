-- KRX 전체 종목 마스터 테이블
CREATE TABLE IF NOT EXISTS stock_master (
  ticker      TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  market      TEXT,
  market_cap  BIGINT DEFAULT 0,
  sector      TEXT DEFAULT '기타',
  krx_sector  TEXT DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_master_sector     ON stock_master(sector);
CREATE INDEX IF NOT EXISTS idx_stock_master_market_cap ON stock_master(market_cap DESC);
CREATE INDEX IF NOT EXISTS idx_stock_master_name       ON stock_master(name);

-- anon 읽기 권한
ALTER TABLE stock_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read" ON stock_master FOR SELECT USING (true);
