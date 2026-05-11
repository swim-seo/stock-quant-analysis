# stock_analysis

한국 주식 퀀트 분석 시스템. YouTube 전문가 인사이트 수집·분석, 기술적 지표, ML 모델, 팩터 분석, 백테스트, 모닝 브리핑을 통합한 AI 기반 퀀트 투자 의사결정 지원 도구.

## 핵심 철학

주식 시장은 이전 패턴이 반복되지 않는다. 과거 기술적 신호(캔들, MA, 수평선 등)만으로는 현재 시장 국면과 맞지 않을 수 있다. 전문가들의 시장 해석을 실시간으로 수집·종합하여 현재 국면을 먼저 파악하고, 그에 맞는 기술적 신호와 팩터를 결합하는 것이 목표다. 도메인 전문가가 아니므로 Claude + Codex + Gemini 오케스트레이션을 통해 더 나은 설계 아이디어를 함께 만들어간다.

## 설계 방향

- 전문가 인사이트 수집: YouTube 전문가 채널 스크립트 수집 → 지금 시장이 어떤 국면인지 파악 (거시 흐름, 섹터 로테이션, 수급 등)
- 인사이트 종합: ChromaDB에 누적·검색 → 현재 국면에 맞는 전문가 분석 RAG 활용
- 팩터 모델: 시장 국면을 반영한 동적 멀티팩터 스코어링 (모멘텀, 밸류, 퀄리티 등)
- ML 앙상블: 전문가 인사이트 + 팩터 + 기술적 지표 통합 예측
- 백테스트: 국면별 전략 유효성 검증
- 자동화: Railway 스케줄러로 일/월 단위 파이프라인 실행

## Tech Stack

- 언어: Python
- DB: Supabase (PostgreSQL)
- 벡터 DB: ChromaDB (chroma_db/)
- 프론트엔드: Next.js (web/)
- 배포: Railway, Vercel
- Package: pip, requirements.txt

## 주요 모듈

data_collector.py     # 주가 데이터 수집
youtube_collector.py  # YouTube 영상 수집
youtube_insights/     # YouTube 분석 결과 (JSON)
youtube_data/         # YouTube 원문 데이터 (TXT)
indicators.py         # 기술적 지표 계산
ml_model.py           # ML 예측 모델
factor_calculator.py  # 팩터 계산
factor_analysis.py    # 팩터 분석
backtester.py         # 백테스트
backtest_multi.py     # 멀티 전략 백테스트
morning_briefing.py   # 모닝 브리핑 생성
agent_supervisor.py   # 에이전트 수퍼바이저
monthly_agent.py      # 월간 종목 선정
monthly_pick.py       # 월간 픽 생성
theme_scanner.py      # 테마 스캐너
fear_greed.py         # 공포탐욕지수 (글로벌)
fear_greed_korea.py   # 공포탐욕지수 (한국)
krx_fetcher.py        # KRX 데이터 수집
multi_timeframe.py    # 멀티 타임프레임 분석
web/                  # Next.js 대시보드
migrations/           # DB 마이그레이션 SQL
scripts/              # 배치 스크립트

## 멀티 에이전트 규칙

- 사고/로그/코드: 영어
- 사용자 응답: 한국어
- 설계 판단 필요 시 → Codex CLI 위임
- 대규모 리서치/문서 분석 → Gemini CLI 위임
- 자세한 규칙: .claude/rules/

---

## Current Project: 매매 신호 시스템 (Trade Signal System)

### Goal
기술적 분석 신호 + YouTube 전문가 인사이트를 통합한 종목별 BUY/SELL/HOLD 신호 시스템.
두 신호의 일치도(signal_agreement)를 점수화하고 YouTube 국면 판단으로 전체 신호 강도를 보정.

### Key Files
- `signal_aggregator.py` (신규) — 핵심 신호 계산 모듈
- `migrations/create_ticker_aliases.sql` (신규) — 한글 종목명→ticker 룩업
- `migrations/create_trade_signals.sql` (신규) — 신호 결과 저장 테이블
- `web/src/app/api/signals/route.ts` (신규) — signals API
- `web/src/app/signals/page.tsx` (신규) — 전용 신호 페이지
- 기존 재활용: `indicators.py`, `portfolio/route.ts:getSignal()`, `sector-signals/route.ts:scoreYoutube()`

### Scoring Design (Codex 검토 반영)
- Composite = tech(40%) + factor(25%) + news(15%) + yt(20%)
- Signal agreement: tech/yt 방향 일치 시 1.15x 배율 (절대값 +N 방식 금지)
- Market regime 히스테리시스: BEAR 진입 >60%, NEUTRAL 복귀 <45%
- YT 언급 0건 → yt_score = 50 (중립 fallback), yt_no_data = TRUE

### trade_signals Table Schema
ticker, stock_name, sector, signal(BUY/SELL/HOLD), composite_score NUMERIC(5,2),
tech_score, yt_score, factor_score, news_score, signal_agreement(0-100),
market_regime(BULL/BEAR/NEUTRAL), yt_mentions, yt_sentiment_ratio,
key_yt_signals JSONB, urgency, trading_type,
data_quality_score FLOAT, yt_no_data BOOLEAN, signal_version INTEGER, calculated_at

### Update Schedule
- Railway cron 일 2회 (기존 07:00/16:00 KST 파이프라인 마지막 단계)
- 수동 트리거: trigger_server.py → UpdateButton

### Critical: ticker_aliases
youtube_insights.key_stocks[]는 한글 종목명 저장. ticker_aliases 테이블 없으면
YT 데이터와 기술적 신호 연결 불가. Phase 1에서 반드시 먼저 구축.