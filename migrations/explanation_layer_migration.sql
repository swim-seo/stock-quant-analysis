-- Explanation layer: trend_state / strategy_type / entry_signal / action_hint
-- passed_conditions / failed_conditions / buy_trigger_conditions / invalidation_conditions
-- Run once on Supabase SQL editor

ALTER TABLE trade_signals
  ADD COLUMN IF NOT EXISTS trend_state              TEXT,
  ADD COLUMN IF NOT EXISTS strategy_type            TEXT,
  ADD COLUMN IF NOT EXISTS entry_signal             TEXT,
  ADD COLUMN IF NOT EXISTS action_hint              TEXT,
  ADD COLUMN IF NOT EXISTS passed_conditions        TEXT[],
  ADD COLUMN IF NOT EXISTS failed_conditions        TEXT[],
  ADD COLUMN IF NOT EXISTS buy_trigger_conditions   TEXT[],
  ADD COLUMN IF NOT EXISTS invalidation_conditions  TEXT[],
  ADD COLUMN IF NOT EXISTS confidence_score         NUMERIC;
