-- 실시간 포트폴리오 신호 테이블
CREATE TABLE IF NOT EXISTS portfolio_signals (
  signal_date DATE NOT NULL,
  ticker TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  entry_price REAL NOT NULL,
  signal_score REAL,
  current_price REAL,
  return_pct REAL,
  status TEXT DEFAULT 'holding',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (signal_date, ticker)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_signals_date ON portfolio_signals(signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_signals_status ON portfolio_signals(status);

ALTER TABLE portfolio_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read" ON portfolio_signals FOR SELECT USING (true);
CREATE POLICY "anon insert" ON portfolio_signals FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update" ON portfolio_signals FOR UPDATE USING (true);
