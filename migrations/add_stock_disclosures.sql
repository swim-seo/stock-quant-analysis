-- stock_disclosures: OpenDART 공시 저장 테이블
-- 기사(stock_news)와 공시(stock_disclosures)를 명확히 분리

CREATE TABLE IF NOT EXISTS stock_disclosures (
    id           bigserial primary key,
    rcept_no     text unique not null,           -- DART 접수번호 (중복 방지)
    ticker       text,                            -- 종목코드 (A 없는 6자리)
    corp_code    text,                            -- DART 고유번호
    corp_name    text,                            -- 회사명
    corp_cls     text,                            -- Y=유가증권, K=코스닥, N=코넥스
    report_nm    text,                            -- 공시제목
    rcept_dt     timestamptz,                     -- 접수일시
    disclosure_type text,                         -- 분류: 정기공시/주요사항/발행공시 등
    source       text default 'DART',
    url          text,
    raw          jsonb,                           -- 원본 JSON
    sentiment    text,                            -- 호재/악재/경고/차단/중립
    impact_score numeric(6,1),                    -- -50 ~ +50 (차단:-50, 강호재:+30)
    action_hint  text,                            -- BUY_OK/BLOCKED/WATCH
    risk_flags   text[],                          -- 거래정지/관리종목/감사의견_비적정 등
    catalyst_tags text[],                         -- 수주/자사주/배당증가 등
    created_at   timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_stock_disclosures_ticker ON stock_disclosures(ticker);
CREATE INDEX IF NOT EXISTS idx_stock_disclosures_rcept_dt ON stock_disclosures(rcept_dt DESC);
CREATE INDEX IF NOT EXISTS idx_stock_disclosures_sentiment ON stock_disclosures(sentiment);
