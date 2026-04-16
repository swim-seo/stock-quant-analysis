# 한국 주식 AI 분석 시스템

## 개요
기술 지표 × ML 예측 × 유튜브 인사이트를 결합한 한국 주식 종합 분석 시스템

## 기술 스택
- Frontend: Next.js 16 + TypeScript + Tailwind CSS
- Backend: Python (Streamlit, yfinance, XGBoost)
- Database: Supabase (PostgreSQL)
- Vector DB: ChromaDB + KR-SBERT
- AI: Claude API (claude-sonnet-4-6)
- 배포: Railway

## 주요 기능

### 1. 종목 차트 분석
- 캔들스틱 차트 (Canvas 기반)
- 이동평균선 (MA5/MA20/MA60)
- RSI 서브차트
- 거래량 서브차트
- 볼린저밴드 토글

### 2. 진입 신호 판단 (5가지 조건)
- 정배열 (MA5 > MA20 > MA60)
- 골든크로스 (MA5가 MA20 상향돌파)
- RSI (과매수/과매도 판단)
- 주봉 추세 (다중 시간프레임)
- 거래량 (20일 평균 대비)
- 각 조건별 ✅ Pass / ⚠️ Warning / ❌ Fail 3단계 판단
- 최종: 🟢진입추천 / 🟡대기 / 🔴위험

### 3. AI 예측
- XGBoost 기반 내일 상승 확률 예측
- 18개 기술 지표 피처 사용
- 예상 등락 범위 및 종가 범위 제공
- TimeSeriesSplit 5-fold 교차검증

### 4. 유튜브 인사이트 자동 수집
- 한국경제TV, 매일경제TV 재생목록 자동 수집
- Claude API로 영상 분석 (요약, 감성, 종목 추출)
- Hybrid RAG (벡터검색 + 키워드검색 + RRF)
- 종목별 관련 인사이트 매칭

### 5. 시장 심리 지수
- 유튜브 전문가 영상의 시장 전망 종합
- 섹터별 심리 지수 (반도체, 에너지, 바이오 등)
- 긍정/중립/부정 비율 시각화

### 6. 한국판 공포탐욕 지수
- 코스피 변동성 (20점)
- 코스피 모멘텀 (20점)
- 거래량 모멘텀 (20점)
- 미국 CNN F&G 연동 (20점)
- 유튜브 심리 점수 (20점)
- 총 100점 만점

### 7. 대시보드
- 시장 심리 카드
- 인기 종목 랭킹
- 최근 유튜브 인사이트 피드
- 종목 검색 (한글 지원)

## 프로젝트 구조
```
stock_analysis/
├── web/                          # Next.js 웹 프론트엔드
│   ├── src/app/                  # 페이지 (대시보드, 종목분석)
│   ├── src/components/           # UI 컴포넌트
│   └── src/lib/                  # API, Supabase, 유틸
├── app.py                        # Streamlit 메인 앱
├── youtube_collector.py          # 유튜브 수집 + Claude 분석
├── data_collector.py             # 주가 데이터 수집
├── indicators.py                 # 기술 지표 계산
├── multi_timeframe.py            # 다중 시간프레임 분석
├── ml_model.py                   # XGBoost ML 예측
├── fear_greed_korea.py           # 한국판 공포탐욕 지수
└── railway_collector.py          # Railway 자동 수집
```

## 실행 방법

### 웹 (Next.js)
```bash
cd web
npm install
npm run dev
```

### Streamlit
```bash
pip install -r requirements.txt
streamlit run app.py
```

### 유튜브 수집
```bash
python youtube_collector.py              # 전체 수집
python youtube_collector.py schedule     # 스케줄러 (08:00/16:00)
python youtube_collector.py historical --days 7  # 과거 수집
```
