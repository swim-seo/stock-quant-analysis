-- Data freshness and trade type classification
ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS data_freshness_score NUMERIC(5,2);

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS stale_components JSONB DEFAULT '[]';

ALTER TABLE trade_signals
ADD COLUMN IF NOT EXISTS trade_type VARCHAR(20)
  CHECK (trade_type IN ('SNIPER', 'SWING', 'LONG_TERM', 'WATCH'));
