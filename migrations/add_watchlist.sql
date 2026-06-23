-- User watchlist: stocks to monitor (holdings, watch candidates, active trades)
CREATE TABLE IF NOT EXISTS watchlist (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL UNIQUE,
  stock_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('HOLDING', 'WATCH', 'TRADE')),
  priority INT DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  note TEXT,
  avg_price NUMERIC(12,0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_category ON watchlist(category);
