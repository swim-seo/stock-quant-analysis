-- Pipeline run logging table
-- Purpose: diagnose Railway cron failures after the fact (Railway logs are ephemeral)
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id          bigserial PRIMARY KEY,
    run_id      text NOT NULL,           -- ISO timestamp of the pipeline start
    mode        text,                    -- morning / afternoon / prices
    stage       text NOT NULL,           -- news / briefing / dart / factor / signal / sniper
    status      text NOT NULL,           -- ok / error / skipped
    error_msg   text,                    -- first 2000 chars of exception message
    rows_written integer,                -- rows upserted (if known)
    duration_s  numeric(8,2),            -- elapsed seconds
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_run_id    ON pipeline_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created_at ON pipeline_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status     ON pipeline_runs(status);
