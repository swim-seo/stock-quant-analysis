-- Fix VARCHAR(10) columns that are too short for actual values
-- market_regime: STRONG_BULL / STRONG_BEAR = 11 chars > VARCHAR(10)
ALTER TABLE trade_signals
  ALTER COLUMN market_regime TYPE VARCHAR(20),
  ALTER COLUMN market_risk_level TYPE VARCHAR(20),
  ALTER COLUMN execution_signal TYPE VARCHAR(20);
