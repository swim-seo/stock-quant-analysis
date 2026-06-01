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

