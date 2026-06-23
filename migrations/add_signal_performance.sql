-- Signal performance tracking: BUY/SELL signals vs actual returns 5d and 10d later
CREATE TABLE IF NOT EXISTS signal_performance (
  id BIGSERIAL PRIMARY KEY,
  signal_date DATE NOT NULL,
  ticker TEXT NOT NULL,
  stock_name TEXT,
  signal TEXT,
  execution_signal TEXT,
  market_risk_level TEXT,
  composite_score NUMERIC(5,2),
  entry_price NUMERIC(12,0),
  close_5d NUMERIC(12,0),
  close_10d NUMERIC(12,0),
  return_5d NUMERIC(6,2),
  return_10d NUMERIC(6,2),
  max_drawdown_10d NUMERIC(6,2),
  hit_take_profit BOOLEAN,
  hit_stop_loss BOOLEAN,
  take_profit_pct NUMERIC(5,2),
  stop_loss_pct NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(signal_date, ticker)
);

CREATE INDEX IF NOT EXISTS idx_signal_performance_date ON signal_performance(signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_signal_performance_ticker ON signal_performance(ticker);
CREATE INDEX IF NOT EXISTS idx_signal_performance_signal ON signal_performance(signal, execution_signal);
