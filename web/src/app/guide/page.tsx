"use client";

import { useState } from "react";
import Link from "next/link";

type Tab = "finance" | "technical" | "methodology";

const sections = {
  finance: [
    {
      term: "PER (주가수익비율)",
      abbr: "Price-to-Earnings Ratio",
      formula: "주가 ÷ 주당순이익(EPS)",
      desc: "주가가 순이익의 몇 배인지 보여줍니다. PER 10 = 순이익 10년치가 현재 주가와 같다는 의미. 낮을수록 저평가 가능성이 높지만, 업종별로 기준이 다릅니다.",
      example: "삼성전자 PER 15 → 시장이 순이익의 15배 가치를 인정",
      signal: "📉 낮은 PER: 저평가 후보 / 📈 높은 PER: 성장 기대 반영",
    },
    {
      term: "PBR (주가순자산비율)",
      abbr: "Price-to-Book Ratio",
      formula: "주가 ÷ 주당순자산(BPS)",
      desc: "회사를 지금 당장 청산했을 때의 자산 대비 주가를 나타냅니다. PBR 1 미만이면 장부가보다 싸게 거래 중. 금융·제조업에 특히 유용합니다.",
      example: "PBR 0.8 → 청산가치보다 20% 싼 가격에 거래 중",
      signal: "📉 PBR < 1: 자산 대비 저평가 구간",
    },
    {
      term: "ROE (자기자본이익률)",
      abbr: "Return on Equity",
      formula: "순이익 ÷ 자기자본 × 100",
      desc: "주주 자금으로 얼마나 효율적으로 이익을 내는지 측정합니다. ROE 15% 이상이면 우량 기업 기준으로 봅니다. PBR과 함께 보면 더 정확합니다.",
      example: "ROE 20% → 자기자본 100원으로 20원 순이익 창출",
      signal: "✅ ROE 높고 PBR 낮으면 → 우량 저평가 조합",
    },
    {
      term: "EPS (주당순이익)",
      abbr: "Earnings Per Share",
      formula: "당기순이익 ÷ 발행주식수",
      desc: "주식 1주당 벌어들인 순이익. PER 계산의 기초이며 실적 성장을 직접 반영합니다. 분기별 EPS 성장률이 중요합니다.",
      example: "EPS 3,000원 → 주식 1주로 3,000원 이익 귀속",
      signal: "📈 EPS 지속 성장 = 실적 기반 상승 가능성",
    },
    {
      term: "시가총액",
      abbr: "Market Capitalization",
      formula: "현재 주가 × 총 발행주식수",
      desc: "시장이 평가하는 회사의 전체 가치. 대형주(10조↑), 중형주(1~10조), 소형주(1조↓)로 구분합니다. 소형주는 변동성이 크지만 성장 잠재력도 높습니다.",
      example: "삼성전자 약 400조원 = KOSPI 시총의 약 20%",
      signal: "🏢 대형주: 안정성 / 🌱 소형주: 성장성",
    },
    {
      term: "배당수익률",
      abbr: "Dividend Yield",
      formula: "연간 배당금 ÷ 주가 × 100",
      desc: "주가 대비 배당금 비율. 배당주 투자의 핵심 지표. 단, 주가 하락으로 수익률이 높아지는 경우는 '위험 신호'일 수 있습니다.",
      example: "배당수익률 4% → 주가 10만원에 4,000원 배당",
      signal: "💰 3~5%: 안정 배당 / 6%↑: 주가 하락 여부 확인 필요",
    },
  ],
  technical: [
    {
      term: "이동평균선 (MA)",
      abbr: "Moving Average",
      formula: "MA5 = 최근 5일 종가 평균",
      desc: "일정 기간 주가의 평균을 연결한 선. 단기(MA5·MA20)와 장기(MA60·MA120)를 비교해 추세를 파악합니다. 이 시스템은 MA5 > MA20 > MA60 정배열을 핵심 조건으로 사용합니다.",
      example: "MA5 > MA20 > MA60 → 단기·중기·장기 모두 상승 추세",
      signal: "✅ 정배열(단>중>장): 상승 추세 확인",
    },
    {
      term: "골든크로스 / 데드크로스",
      abbr: "Golden Cross / Dead Cross",
      formula: "단기 MA가 장기 MA를 상향/하향 돌파",
      desc: "골든크로스: MA5가 MA20을 아래에서 위로 돌파 → 매수 신호. 데드크로스: 반대로 하향 돌파 → 매도 신호. 이 시스템은 최근 10일 이내 골든크로스를 진입 조건으로 사용합니다.",
      example: "10일 이내 MA5가 MA20 상향 돌파 → 진입 조건 충족",
      signal: "✅ 최근 10일 이내 골든크로스 발생",
    },
    {
      term: "RSI (상대강도지수)",
      abbr: "Relative Strength Index",
      formula: "100 - 100/(1 + 평균상승/평균하락)",
      desc: "14일간 주가의 상승·하락 강도를 0~100으로 표시. 70 이상은 과매수(조정 위험), 30 이하는 과매도(반등 기대). 이 시스템은 RSI 40~60 구간을 '건강한 상승 초기' 조건으로 씁니다.",
      example: "RSI 50 → 과매수도 과매도도 아닌 중립 구간",
      signal: "✅ RSI 40~60: 건강한 매수 구간 / ⚠️ 70↑: 과열 주의",
    },
    {
      term: "볼린저 밴드",
      abbr: "Bollinger Bands",
      formula: "중심선(MA20) ± 2×표준편차",
      desc: "주가의 변동 범위를 3개 선(상단·중심·하단)으로 표시. 상단 돌파는 과매수, 하단 이탈은 과매도 신호. 밴드 폭이 좁아지면 곧 큰 움직임이 올 수 있습니다.",
      example: "주가가 하단밴드 터치 후 반등 → 매수 기회",
      signal: "📊 밴드 수축 후 확장 → 방향성 돌파 임박",
    },
    {
      term: "MACD",
      abbr: "Moving Average Convergence Divergence",
      formula: "EMA12 - EMA26 / 시그널선 = MACD 9일 EMA",
      desc: "두 이동평균 간의 차이로 추세 전환을 포착합니다. MACD선이 시그널선을 위로 돌파하면 매수, 아래로 돌파하면 매도 신호.",
      example: "MACD > 시그널선 + 히스토그램 증가 → 상승 모멘텀 강화",
      signal: "✅ MACD 골든크로스 + 히스토그램 양전환",
    },
    {
      term: "거래량",
      abbr: "Volume",
      formula: "당일 거래량 ÷ 20일 평균 거래량",
      desc: "가격 움직임의 신뢰도를 확인합니다. 상승 시 거래량 증가 = 신뢰할 수 있는 상승. 이 시스템은 거래량 > 20일 평균의 1.2배를 진입 조건으로 사용합니다.",
      example: "주가 3% 상승 + 거래량 평균의 2배 → 강한 매수세 확인",
      signal: "✅ 거래량 > 20일 평균×1.2: 진입 조건 충족",
    },
    {
      term: "모멘텀",
      abbr: "Price Momentum",
      formula: "현재가 ÷ N일 전 가격 - 1",
      desc: "일정 기간 주가 상승률. 퀀트 스크리너에서는 3개월(M3), 6개월(M6), 12개월(M12) 모멘텀을 계산하고, M3에 가장 높은 가중치(40%)를 줍니다.",
      example: "3개월 모멘텀 +30% → 최근 3달간 30% 상승",
      signal: "📈 3M 모멘텀 상위 종목 = 단기 추세 주도주",
    },
  ],
  methodology: [
    {
      term: "진입 신호 5조건 (3단계 평가)",
      abbr: "Entry Signal",
      formula: "각 조건: ✅ 1점 / ⚠️ 0.5점 / ❌ 0점",
      desc: `개별 주식 페이지에서 매수 타이밍을 평가하는 5가지 조건:\n\n① 이동평균 정배열: MA5 > MA20 > MA60 동시 충족\n② 골든크로스: 최근 10일 이내 MA5가 MA20 상향 돌파\n③ RSI: 40~60 구간 (매수 초기 건강한 구간)\n④ 주간 추세: 주봉 MA5 > MA20 (상위 타임프레임 확인)\n⑤ 거래량: 당일 거래량 > 20일 평균의 1.2배`,
      example: "총점 4~5점: 🟢 진입 / 2.5~3.5점: 🟡 대기 / 2.5점 미만: 🔴 위험",
      signal: "",
    },
    {
      term: "퀀트 팩터 랭킹 공식",
      abbr: "Composite Factor Score",
      formula: "종합점수 = 모멘텀(40%) + 상대강도(25%) + 저변동성(15%) + 수급(20%)",
      desc: `퀀트 스크리너에서 131개 종목을 랭킹하는 복합 팩터:\n\n• 모멘텀 (40%): 3M·6M·12M 수익률의 가중 평균 — 최근 추세가 지속되는 경향\n• 상대강도 (25%): KOSPI 대비 초과수익률 — 시장보다 강한 종목 선별\n• 저변동성 (15%): 낮은 변동성일수록 높은 점수 — 리스크 조정 수익률 개선\n• 수급 (20%): 외국인·기관 5일/20일 순매수 — 스마트머니 추적`,
      example: "각 팩터를 Z-점수로 정규화 후 가중합산 → 0~100점 변환",
      signal: "",
    },
    {
      term: "섹터 로테이션 단계",
      abbr: "Sector Rotation Stage",
      formula: "뉴스 감성 점수 + 수급 점수 → 0~100 종합",
      desc: `경기 사이클에 따라 강세 섹터가 순환합니다. 이 시스템은 각 섹터별로:\n\n① 뉴스 수집: 최근 7일 주요 뉴스 수집 (news_collector.py)\n② 감성 분석: Claude AI가 각 뉴스를 긍정/중립/부정으로 분류\n③ 수급 집계: 해당 섹터 종목들의 외국인·기관 매매 합산\n④ 종합 점수: 감성(60%) + 수급(40%) → 100점 환산\n⑤ 단계 판정: 70↑=선도/50~70=추격/30~50=주의/30↓=회피`,
      example: "반도체 섹터 점수 82 → '선도' 단계, 집중 매수 관심",
      signal: "",
    },
    {
      term: "공포·탐욕 지수",
      abbr: "Fear & Greed Index (Korea)",
      formula: "5개 컴포넌트 가중 평균 → 0~100",
      desc: `한국 시장에 맞게 커스터마이즈된 5가지 지표:\n\n① KOSPI 변동성 (20%): VIX 개념, 변동성 낮을수록 탐욕\n② KOSPI 모멘텀 (25%): 125일 이동평균 대비 현재가\n③ 거래량 모멘텀 (20%): 최근 거래량 vs 과거 평균\n④ 미국 CNN F&G (20%): 글로벌 투자 심리 반영\n⑤ 유튜브 감성 (15%): 투자 유튜버 영상 Claude AI 분석`,
      example: "지수 25 = 극도 공포 (역발상 매수 기회) / 75 = 탐욕 (조정 주의)",
      signal: "",
    },
    {
      term: "상대강도 (RS)",
      abbr: "Relative Strength vs KOSPI",
      formula: "RS = 종목 3개월 수익률 - KOSPI 3개월 수익률",
      desc: "개별 종목이 시장(KOSPI) 대비 얼마나 강하게 움직이는지 측정합니다. RS +20%이면 시장보다 20%포인트 더 상승. 시장이 하락할 때도 RS가 높은 종목은 상대적 강자입니다.",
      example: "KOSPI +5%, 종목 +30% → RS = +25%",
      signal: "✅ RS 양수이고 커질수록 → 주도주 후보",
    },
  ],
};

export default function GuidePage() {
  const [tab, setTab] = useState<Tab>("finance");

  const tabLabels: Record<Tab, string> = {
    finance: "📊 재무지표",
    technical: "📈 기술지표",
    methodology: "🔬 분석방법론",
  };

  const items = sections[tab];

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header style={{ background: "#ffffff", borderBottom: "1px solid var(--border)", padding: "12px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <Link href="/" style={{ textDecoration: "none" }}>
              <p style={{ fontSize: 10, letterSpacing: 3, color: "var(--blue)", fontWeight: 700, margin: 0 }}>KOREA STOCK AI</p>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-1)", letterSpacing: -0.5, margin: 0 }}>용어 & 방법론 가이드</h1>
            </Link>
          </div>
          <Link href="/" style={{ fontSize: 13, color: "var(--text-3)", textDecoration: "none" }}>← 대시보드</Link>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px" }}>
        {/* Description */}
        <div style={{ background: "#f0f7ff", borderRadius: 12, padding: "14px 18px", marginBottom: 24, border: "1px solid #dbeafe" }}>
          <p style={{ fontSize: 13, color: "#1e40af", margin: 0, lineHeight: 1.6 }}>
            이 페이지는 대시보드에서 사용하는 모든 지표와 분석 방법론을 설명합니다.
            <strong> 어떻게 분석해서 이 값이 나왔는지</strong> 투명하게 공개합니다.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "2px solid var(--border)", paddingBottom: 0 }}>
          {(Object.keys(tabLabels) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "9px 18px",
                fontSize: 13,
                fontWeight: tab === t ? 700 : 500,
                border: "none",
                background: "none",
                cursor: "pointer",
                color: tab === t ? "var(--blue)" : "var(--text-3)",
                borderBottom: tab === t ? "2px solid var(--blue)" : "2px solid transparent",
                marginBottom: -2,
                transition: "all 0.15s",
              }}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item) => (
            <div
              key={item.term}
              style={{
                background: "#ffffff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "20px 22px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{item.term}</h2>
                <span style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>{item.abbr}</span>
              </div>

              <div style={{ background: "#f8fafc", borderRadius: 6, padding: "6px 12px", marginBottom: 12, display: "inline-block" }}>
                <code style={{ fontSize: 12, color: "#0f172a", fontFamily: "monospace" }}>{item.formula}</code>
              </div>

              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7, margin: "0 0 10px", whiteSpace: "pre-line" }}>
                {item.desc}
              </p>

              {item.example && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 12, color: "#64748b", background: "#f8fafc", borderLeft: "3px solid #94a3b8", padding: "6px 10px", borderRadius: "0 6px 6px 0" }}>
                    예시: {item.example}
                  </div>
                  {item.signal && (
                    <div style={{ fontSize: 12, color: "#1e40af", background: "#eff6ff", borderLeft: "3px solid #3b82f6", padding: "6px 10px", borderRadius: "0 6px 6px 0" }}>
                      {item.signal}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, textAlign: "center" }}>
          <Link href="/" style={{ display: "inline-block", padding: "10px 24px", background: "var(--blue)", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    </main>
  );
}
