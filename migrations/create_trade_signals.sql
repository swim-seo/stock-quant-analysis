-- trade_signals 테이블: 기술적 신호 + YouTube 인사이트 통합 매매 신호
-- Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS trade_signals (
  id                   SERIAL PRIMARY KEY,
  ticker               VARCHAR(20)   NOT NULL UNIQUE,
  stock_name           VARCHAR(100)  NOT NULL,
  sector               VARCHAR(50),

  -- 종합 신호
  signal               VARCHAR(10)   NOT NULL CHECK (signal IN ('BUY', 'SELL', 'HOLD')),
  composite_score      NUMERIC(5,2)  NOT NULL,  -- 0.00 ~ 100.00
  signal_version       INTEGER       NOT NULL DEFAULT 1,

  -- 컴포넌트 점수 (각 0~100)
  tech_score           NUMERIC(5,2),
  yt_score             NUMERIC(5,2),
  factor_score         NUMERIC(5,2),
  news_score           NUMERIC(5,2),

  -- 신호 일치도 (tech vs yt 방향 일치 여부, 0~100)
  signal_agreement     NUMERIC(5,2),

  -- 시장 국면 (YouTube 전문가 합의 기반)
  market_regime        VARCHAR(10)   CHECK (market_regime IN ('BULL', 'BEAR', 'NEUTRAL')),

  -- YouTube 데이터
  yt_mentions          INTEGER       DEFAULT 0,
  yt_sentiment_ratio   NUMERIC(4,3), -- 긍정/(긍정+부정), 0.000~1.000
  key_yt_signals       JSONB         DEFAULT '[]',  -- 전문가 언급 텍스트 스니펫
  urgency              VARCHAR(20),  -- TODAY / THIS_WEEK / LONG_TERM
  trading_type         VARCHAR(20),  -- 단타 / 스윙 / 장기

  -- 데이터 품질
  data_quality_score   FLOAT,        -- 0.0~1.0 (입력 데이터 완성도)
  yt_no_data           BOOLEAN       DEFAULT FALSE,  -- YT 언급 없어서 중립 fallback 사용 여부

  calculated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_trade_signals_ticker        ON trade_signals (ticker);
CREATE INDEX IF NOT EXISTS idx_trade_signals_signal        ON trade_signals (signal);
CREATE INDEX IF NOT EXISTS idx_trade_signals_sector        ON trade_signals (sector);
CREATE INDEX IF NOT EXISTS idx_trade_signals_calculated_at ON trade_signals (calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_signals_composite     ON trade_signals (composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_trade_signals_key_yt        ON trade_signals USING GIN (key_yt_signals);

-- Row Level Security (읽기 허용)
ALTER TABLE trade_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON trade_signals;
CREATE POLICY "public read" ON trade_signals FOR SELECT USING (true);
