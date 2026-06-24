-- D+1 / D+3 return tracking for signal_performance
ALTER TABLE signal_performance ADD COLUMN IF NOT EXISTS close_1d   NUMERIC(12,0);
ALTER TABLE signal_performance ADD COLUMN IF NOT EXISTS close_3d   NUMERIC(12,0);
ALTER TABLE signal_performance ADD COLUMN IF NOT EXISTS return_1d  NUMERIC(6,2);
ALTER TABLE signal_performance ADD COLUMN IF NOT EXISTS return_3d  NUMERIC(6,2);
