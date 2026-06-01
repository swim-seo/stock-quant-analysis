import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "용어 & 방법론 가이드 | Stock AI Dashboard",
  description: "한국 주식 AI 대시보드의 재무지표, 기술지표, 분석 방법론 설명",
};

const financialTerms = [
  {
    term: "PER (주가수익비율)",
    formula: "주가 ÷ 주당순이익(EPS)",
    desc: "현재 주가가 회사의 이익 대비 몇 배에 거래되는지 보여줍니다. 낮은 PER은 저평가 가능성을 뜻할 수 있지만, 성장성이 낮거나 업황이 나빠서 낮을 수도 있어 업종 평균과 함께 봐야 합니다.",
  },
  {
    term: "PBR (주가순자산비율)",
    formula: "주가 ÷ 주당순자산(BPS)",
    desc: "회사의 장부상 순자산 대비 주가 수준을 나타냅니다. PBR 1배 미만은 장부가보다 낮게 거래된다는 뜻이지만, 자산의 질과 ROE가 낮으면 단순 저평가로 보기 어렵습니다.",
  },
  {
    term: "ROE (자기자본이익률)",
    formula: "순이익 ÷ 자기자본 × 100",
    desc: "주주 자본으로 얼마나 효율적으로 이익을 만드는지 측정합니다. ROE가 높고 꾸준하면 같은 PBR이라도 더 높은 평가를 받을 수 있습니다.",
  },
  {
    term: "EPS (주당순이익)",
    formula: "당기순이익 ÷ 발행주식수",
    desc: "주식 1주에 귀속되는 순이익입니다. PER 계산의 기초이며, EPS가 꾸준히 증가하면 실적 기반의 주가 상승 근거가 강해집니다.",
  },
  {
    term: "시가총액",
    formula: "현재 주가 × 총 발행주식수",
    desc: "시장이 평가하는 회사 전체의 가치입니다. 대형주는 안정성과 유동성이 강하고, 중소형주는 변동성이 크지만 성장 여지가 클 수 있습니다.",
  },
  {
    term: "배당수익률",
    formula: "연간 주당 배당금 ÷ 현재 주가 × 100",
    desc: "현재 주가로 주식을 샀을 때 배당으로 기대할 수 있는 연 수익률입니다. 주가 급락 때문에 배당수익률이 높아진 경우에는 배당 유지 가능성을 확인해야 합니다.",
  },
];

const technicalTerms = [
  {
    term: "RSI (상대강도지수)",
    formula: "100 - 100 ÷ (1 + 평균 상승폭 ÷ 평균 하락폭)",
    desc: "최근 상승과 하락의 힘을 0~100으로 표시하는 지표입니다. 보통 70 이상은 과열, 30 이하는 과매도로 보며, 이 대시보드는 RSI 40~60을 무리하지 않은 상승 초기 구간으로 봅니다.",
  },
  {
    term: "이동평균(MA)",
    formula: "N일 이동평균 = 최근 N일 종가 평균",
    desc: "주가의 단기 흔들림을 줄여 추세를 보는 선입니다. MA5, MA20, MA60처럼 기간을 나누며, MA5 > MA20 > MA60은 단기·중기·장기 추세가 위로 정렬된 상태입니다.",
  },
  {
    term: "골든크로스",
    formula: "단기 이동평균선이 장기 이동평균선을 상향 돌파",
    desc: "짧은 기간의 가격 흐름이 긴 기간의 흐름보다 강해지는 순간입니다. 이 대시보드는 최근 10거래일 안에 MA5가 MA20을 상향 돌파했는지를 진입 조건으로 사용합니다.",
  },
  {
    term: "상대강도(RS, Relative Strength)",
    formula: "종목 수익률 - 코스피 수익률 (동일 기간)",
    desc: "시장 전체 흐름을 빼고도 종목이 얼마나 강한지 보는 지표입니다. RS가 양수(+)이면 코스피보다 강하게 올랐다는 뜻이며, 퀀트 스크리너에서 20% 비중으로 반영됩니다.",
  },
  {
    term: "볼린저밴드",
    formula: "중심선(MA20) ± 2 × 표준편차",
    desc: "가격이 평균에서 얼마나 떨어져 있는지 변동성 범위로 보여줍니다. 하단 이탈 시 과매도 반등 신호(+8점), 상단 돌파 시 과매수 주의(-8점)로 매매신호 점수에 반영됩니다.",
  },
  {
    term: "MACD",
    formula: "MACD선 = 12일 EMA - 26일 EMA, 시그널선 = MACD의 9일 EMA",
    desc: "두 지수이동평균의 차이로 추세 전환과 모멘텀 변화를 확인합니다. MACD선이 시그널선을 위로 넘으면 상승 전환 신호로 해석할 수 있습니다.",
  },
  {
    term: "OBV (On-Balance Volume)",
    formula: "상승일: OBV + 거래량, 하락일: OBV - 거래량",
    desc: "거래량을 가격 방향에 따라 누적한 지표로 매집(accumulation)과 분산(distribution)을 판단합니다. OBV가 5일 기준 2% 이상 상승 추세면 매집 신호(+5점)로 반영됩니다.",
  },
  {
    term: "ADX (평균방향지수)",
    formula: "방향성 움직임 지수의 14일 이동평균",
    desc: "추세의 강도를 0~100으로 표시합니다. 25 이상이면 강한 추세로 판단하여 현재 방향(상승/하락)을 증폭시킵니다. 방향은 알 수 없고 '강도'만 측정합니다.",
  },
  {
    term: "거래량",
    formula: "당일 거래량 ÷ 20일 평균 거래량",
    desc: "가격 움직임에 참여한 힘의 크기입니다. 상승과 함께 거래량이 늘면 신뢰도가 높고, 이 대시보드는 당일 거래량이 20일 평균의 1.2배를 넘는지를 확인합니다.",
  },
  {
    term: "모멘텀",
    formula: "현재가 ÷ 과거 기준가 - 1 (skip: 1주일 제외)",
    desc: "일정 기간 동안 가격이 얼마나 강하게 움직였는지 보는 지표입니다. 단기 되돌림을 제거하기 위해 3M은 5일, 6M은 10일, 12M은 21일 skip을 적용합니다.",
  },
  {
    term: "트레일링 스탑 (Trailing Stop)",
    formula: "청산 기준가 = 보유 기간 중 최고가 × (1 - 트레일링 %)",
    desc: "가격이 오를수록 손절 기준을 따라 올리는 동적 청산 방법입니다. 이익을 보호하면서 더 큰 상승을 놓치지 않을 수 있습니다. 이 시스템은 촉매 강도에 따라 -4%~-10%를 적용합니다.",
  },
];

const entryConditions = [
  ["이동평균 정배열", "MA5 > MA20 > MA60"],
  ["골든크로스", "최근 10거래일 안에 MA5가 MA20 상향 돌파"],
  ["RSI 구간", "RSI 40~60"],
  ["주간 추세 게이트", "주봉 기준 상승 추세 통과"],
  ["거래량 확인", "당일 거래량 > 1.2 × 20일 평균 거래량"],
];

function TermCard({ term, formula, desc }: { term: string; formula: string; desc: string }) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <h3 className="text-base font-extrabold text-[var(--text-1)]">{term}</h3>
      <div className="mt-3 inline-flex max-w-full rounded-lg bg-slate-50 px-3 py-2">
        <code className="break-words text-xs text-slate-800">{formula}</code>
      </div>
      <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">{desc}</p>
    </article>
  );
}

function Section({ id, title, eyebrow, children }: { id: string; title: string; eyebrow: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-4">
        <p className="text-xs font-bold tracking-[0.18em] text-[var(--blue)]">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black text-[var(--text-1)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function InfoBox({ children, color = "blue" }: { children: ReactNode; color?: "blue" | "green" | "orange" | "red" }) {
  const styles = {
    blue:   "bg-blue-50 border-blue-100 text-blue-800",
    green:  "bg-emerald-50 border-emerald-100 text-emerald-800",
    orange: "bg-amber-50 border-amber-100 text-amber-800",
    red:    "bg-rose-50 border-rose-100 text-rose-800",
  };
  return (
    <div className={`mt-3 rounded-lg border px-4 py-3 text-sm leading-7 ${styles[color]}`}>
      {children}
    </div>
  );
}

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-white px-6 py-3">
        <div className="mx-auto flex max-w-[980px] items-center justify-between gap-4">
          <Link href="/" className="no-underline">
            <p className="m-0 text-[10px] font-bold tracking-[0.18em] text-[var(--blue)]">KOREA STOCK AI</p>
            <h1 className="m-0 text-xl font-extrabold text-[var(--text-1)]">용어 & 방법론 가이드</h1>
          </Link>
          <Link href="/" className="shrink-0 text-sm font-semibold text-[var(--text-3)] no-underline">← 대시보드</Link>
        </div>
      </header>

      <div className="mx-auto max-w-[980px] px-6 py-7">
        <nav className="sticky top-0 z-10 -mx-6 border-b border-[var(--border)] bg-[rgba(242,244,246,0.94)] px-6 py-3 backdrop-blur">
          <div className="flex gap-2 overflow-x-auto">
            {[
              ["재무지표", "#financial"],
              ["기술지표", "#technical"],
              ["분석방법론", "#methodology"],
              ["2단계 매매신호", "#signal2stage"],
              ["스나이퍼 단타", "#sniper"],
              ["IC 팩터 검증", "#ic"],
              ["시장 국면", "#regime"],
            ].map(([label, href]) => (
              <a key={href} href={href}
                className="shrink-0 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-bold text-[var(--text-2)] no-underline">
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="mt-8 flex flex-col gap-12">

          {/* ── 재무지표 ── */}
          <Section id="financial" eyebrow="FINANCIAL" title="재무지표">
            <div className="grid gap-4 md:grid-cols-2">
              {financialTerms.map((item) => <TermCard key={item.term} {...item} />)}
            </div>
          </Section>

          {/* ── 기술지표 ── */}
          <Section id="technical" eyebrow="TECHNICAL" title="기술지표">
            <div className="grid gap-4 md:grid-cols-2">
              {technicalTerms.map((item) => <TermCard key={item.term} {...item} />)}
            </div>
          </Section>

          {/* ── 분석방법론 ── */}
          <Section id="methodology" eyebrow="METHODOLOGY" title="분석방법론">
            <div className="flex flex-col gap-4">

              {/* 진입신호 5조건 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">진입신호 5조건</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">종목 상세 페이지에서 아래 5가지 조건을 채점해 진입 적합성을 판단합니다.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs text-[var(--text-3)]">
                        <th className="px-3 py-2 font-bold">조건</th>
                        <th className="px-3 py-2 font-bold">판정 기준</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entryConditions.map(([name, rule]) => (
                        <tr key={name} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-3 font-bold text-[var(--text-1)]">{name}</td>
                          <td className="px-3 py-3 text-[var(--text-2)]">{rule}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-700">✅ 1점: 충족</div>
                  <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm font-bold text-amber-700">⚠ 0.5점: 부분 충족</div>
                  <div className="rounded-lg bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">❌ 0점: 미충족</div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-emerald-100 px-3 py-3 text-sm text-[var(--text-2)]"><strong className="text-emerald-700">🟢 4점 이상</strong><br />진입 후보</div>
                  <div className="rounded-lg border border-amber-100 px-3 py-3 text-sm text-[var(--text-2)]"><strong className="text-amber-700">🟡 2.5~3.5점</strong><br />대기</div>
                  <div className="rounded-lg border border-rose-100 px-3 py-3 text-sm text-[var(--text-2)]"><strong className="text-rose-700">🔴 2.5점 미만</strong><br />위험</div>
                </div>
              </article>

              {/* 퀀트 스크리너 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">퀀트 스크리너 — 팩터 랭킹 공식</h3>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                  <code className="text-xs text-slate-800">
                    종합점수 = 샤프모멘텀(45%) + 상대강도(20%) + 수급flow(15%) + 가치PBR(20%)
                  </code>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  131개 종목 각각의 팩터를 Z-score로 정규화한 뒤 가중합산합니다. 그 결과를 0~100 percentile로
                  변환하므로 <strong>100점 = 131개 중 최상단</strong>을 뜻합니다.
                </p>
                <InfoBox color="blue">
                  <p><strong>샤프모멘텀</strong>: 3M(5일skip)·6M(10일skip)·12M(21일skip) 수익률을 변동성으로 나눠 위험 대비 모멘텀 측정</p>
                  <p><strong>수급 정규화</strong>: 외국인+기관 순매수를 cross-sectional z-score로 정규화 → 삼성전자 등 대형주의 절대금액 지배 방지</p>
                </InfoBox>
                <div className="mt-4 grid gap-2 sm:grid-cols-5 text-sm text-center">
                  {[["75~100","최상위","#f04452"],["55~75","진입검토","#00b493"],["40~55","중립","#f5a623"],["25~40","하위","#888"],["~25","최하위","#bbb"]].map(([range, label, color]) => (
                    <div key={range} style={{ borderColor: color }} className="rounded-lg border px-2 py-3">
                      <p style={{ color }} className="font-extrabold">{range}</p>
                      <p className="text-xs text-[var(--text-3)] mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              </article>

              {/* 저평가 우량주 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">저평가 우량주 선별 기준 (PBR + ROE 연동)</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  단순히 PBR이 낮다고 저평가 우량주로 보지 않습니다. 수익성(ROE)이 동반되지 않은 저PBR은 <strong>가치함정(Value Trap)</strong>일 수 있습니다.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs text-[var(--text-3)]">
                        <th className="px-3 py-2 font-bold">조건</th><th className="px-3 py-2 font-bold">가점</th><th className="px-3 py-2 font-bold">설명</th>
                      </tr>
                    </thead>
                    <tbody className="text-[var(--text-2)]">
                      {[
                        ["PBR < 0.5 + ROE > 10%","+30점 (emerald)","수익성이 확인된 진짜 저평가"],
                        ["PBR < 1.0","+20점 (amber)","장부가 미만 거래"],
                        ["PER < 8","+25점 (blue)","이익 대비 매우 낮은 주가"],
                        ["ROE > 15%","+20점 (emerald)","높은 자본 효율성"],
                        ["부채비율 < 100%","+15점 (blue)","재무 안전성 확보"],
                      ].map(([c, p, d]) => (
                        <tr key={c} className="border-b border-slate-100">
                          <td className="px-3 py-3 font-bold">{c}</td>
                          <td className="px-3 py-3 font-bold text-emerald-700">{p.split(" ")[0]}</td>
                          <td className="px-3 py-3">{d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              {/* 섹터 로테이션 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">섹터 로테이션 국면 판별 (KIS 실데이터)</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  KIS API에서 수집한 업종별 지수(FHPUP02100000)의 5주 이력을 분석해 현재 국면을 자동 판별합니다.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-4 text-sm text-center">
                  {[
                    ["🔴 과열","RSI ≥ 75","차익실현 검토"],
                    ["🟢 상승기","5주 +5% 이상, 기울기 ↑","진입 초·중반"],
                    ["🔵 진입기","5주 +1~5%, 기울기 ↑","바닥권 반등"],
                    ["⚫ 하락기 / 침체","5주 -5% 이하","대기"],
                  ].map(([phase, formula, note]) => (
                    <div key={phase} className="rounded-lg border border-[var(--border)] px-3 py-3">
                      <p className="font-bold text-[var(--text-1)]">{phase}</p>
                      <p className="text-xs text-[var(--blue)] mt-1">{formula}</p>
                      <p className="text-xs text-[var(--text-3)] mt-1">{note}</p>
                    </div>
                  ))}
                </div>
              </article>

              {/* 공포탐욕 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">공포탐욕 지수 — 5가지 구성요소</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs text-[var(--text-3)]">
                        <th className="px-3 py-2 font-bold">구성요소</th><th className="px-3 py-2 font-bold">측정 방법</th>
                      </tr>
                    </thead>
                    <tbody className="text-[var(--text-2)]">
                      {[
                        ["코스피 변동성","최근 변동성이 낮을수록 탐욕"],
                        ["코스피 모멘텀","최근 상승폭이 클수록 탐욕"],
                        ["거래량 모멘텀","거래량 증가 = 참여 심리 강화"],
                        ["미국 CNN F&G","글로벌 투자 심리 반영"],
                        ["유튜브 심리","국내 투자 채널 감성 분석"],
                      ].map(([name, desc]) => (
                        <tr key={name} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-3 font-bold">{name}</td>
                          <td className="px-3 py-3">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          </Section>

          {/* ── 2단계 매매신호 ── */}
          <Section id="signal2stage" eyebrow="SIGNAL" title="2단계 매매신호 (퀀트 × 타이밍)">
            <div className="flex flex-col gap-4">
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">설계 원칙: 구조적 강도 × 진입 타이밍</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  단순히 점수를 합산하는 방식 대신, <strong>두 단계를 모두 충족해야 BUY 신호</strong>가 나옵니다.
                  퀀트 팩터가 좋아도 타이밍이 나쁘면 대기, 타이밍이 좋아도 구조가 약하면 매수 금지입니다.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                    <p className="font-bold text-blue-800 mb-2">Stage 1 — 품질 등급 (퀀트 팩터)</p>
                    <p className="text-sm text-blue-700">"이 종목이 구조적으로 강한가?"</p>
                    <div className="mt-2 text-sm space-y-1">
                      <p><strong>A등급 (≥65점)</strong>: 구조적으로 강함 → BUY 가능</p>
                      <p><strong>B등급 (40~65점)</strong>: 중립 → 시장 좋을 때만 BUY</p>
                      <p><strong>C등급 (&lt;40점)</strong>: 구조 취약 → 매수 금지</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                    <p className="font-bold text-emerald-800 mb-2">Stage 2 — 타이밍 점수 (기술+감성)</p>
                    <p className="text-sm text-emerald-700">"지금 들어갈 타이밍인가?"</p>
                    <div className="mt-2 rounded bg-white/60 px-2 py-1 text-xs">
                      <code>타이밍 = 기술점수(55%) + 뉴스(25%) + 유튜브(20%)</code>
                    </div>
                    <p className="mt-2 text-xs text-emerald-700">※ 팩터 점수는 Stage 1에서 이미 반영되어 제외</p>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs text-[var(--text-3)]">
                        <th className="px-3 py-2">품질 등급</th><th className="px-3 py-2">타이밍</th><th className="px-3 py-2">시장</th><th className="px-3 py-2">신호</th>
                      </tr>
                    </thead>
                    <tbody className="text-[var(--text-2)]">
                      {[
                        ["A등급","좋음 (≥65)","any","✅ BUY"],
                        ["A등급","나쁨 (≤35)","BEAR","🔴 SELL"],
                        ["A등급","나쁨","not BEAR","⏳ HOLD (타이밍 대기)"],
                        ["B등급","좋음","BULL/NEUTRAL","✅ BUY"],
                        ["B등급","나쁨","any","🔴 SELL"],
                        ["C등급","좋음","any","⏳ HOLD (구조 약, 매수 금지)"],
                        ["C등급","나쁨","any","🔴 SELL"],
                      ].map(([q,t,m,s]) => (
                        <tr key={q+t} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-bold">{q}</td>
                          <td className="px-3 py-2">{t}</td>
                          <td className="px-3 py-2">{m}</td>
                          <td className="px-3 py-2 font-bold">{s}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                  <code className="text-xs text-slate-800">복합점수 = 품질등급(40%) × 타이밍점수(60%)</code>
                </div>
              </article>
            </div>
          </Section>

          {/* ── 스나이퍼 단타 ── */}
          <Section id="sniper" eyebrow="SNIPER" title="⚡ 스나이퍼 단타 전략">
            <div className="flex flex-col gap-4">
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">전략 개요</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  매달 25일~다음달 10일(약 10 거래일) 동안 <strong>뉴스·유튜브 촉매(Catalyst)</strong>를 빠르게 포착해
                  능동적으로 사고파는 스윙 단타 전략입니다. 포지션은 청산 후 재투자할 수 있습니다.
                </p>
                <InfoBox color="orange">
                  <strong>촉매(Catalyst)</strong>: 주가를 움직이는 재료. 이 시스템에서는 당일 긍정 뉴스(호재)와 유튜브 언급이 동시에 발생한 경우를 촉매로 정의합니다.
                </InfoBox>

                <h4 className="mt-5 font-bold text-[var(--text-1)]">진입 신호 가중치</h4>
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
                  <code className="text-xs text-slate-800">
                    종합점수 = 오늘 뉴스(35%) + 오늘 유튜브(30%) + 기술점수(25%) + ML점수(10%)
                  </code>
                </div>
                <p className="mt-2 text-sm text-[var(--text-2)]">0.45 이상이고 뉴스 또는 유튜브 긍정 신호가 있어야 진입 후보에 오릅니다.</p>

                <h4 className="mt-5 font-bold text-[var(--text-1)]">촉매 강도별 청산 규칙</h4>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs text-[var(--text-3)]">
                        <th className="px-3 py-2">촉매 등급</th><th className="px-3 py-2">기준점수</th><th className="px-3 py-2">1차 익절</th><th className="px-3 py-2">트레일링</th><th className="px-3 py-2">최대보유</th>
                      </tr>
                    </thead>
                    <tbody className="text-[var(--text-2)]">
                      {[
                        ["🚀 초강","≥ 0.85","+20%","-10%","7일"],
                        ["💪 강","≥ 0.70","+15%","-8%","5일"],
                        ["📈 보통","≥ 0.55","+10%","-6%","4일"],
                        ["📊 약","< 0.55","+7%","-4%","3일"],
                      ].map(([g,s,t,tr,d]) => (
                        <tr key={g} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-bold">{g}</td>
                          <td className="px-3 py-2">{s}</td>
                          <td className="px-3 py-2 text-emerald-700 font-bold">{t} 시 50% 매도</td>
                          <td className="px-3 py-2 text-blue-700">{tr}</td>
                          <td className="px-3 py-2">{d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h4 className="mt-5 font-bold text-[var(--text-1)]">하드 규칙 (불변)</h4>
                <div className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
                  <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-3">
                    <p className="font-bold text-rose-700">🛑 즉시 손절</p>
                    <p className="text-rose-600 mt-1">-5% 하락</p>
                  </div>
                  <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-3">
                    <p className="font-bold text-red-700">🔴 즉시 청산</p>
                    <p className="text-red-600 mt-1">신호 반전 SELL 또는 악재 뉴스</p>
                  </div>
                  <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-3">
                    <p className="font-bold text-orange-700">🚀 상한가 자동익절</p>
                    <p className="text-orange-600 mt-1">+25% 이상 즉시 전량</p>
                  </div>
                </div>

                <h4 className="mt-5 font-bold text-[var(--text-1)]">예시: +15% 올랐다가 +10%로 풀백</h4>
                <InfoBox color="green">
                  <p>강한 촉매(0.70+) 기준: 트레일링 -8% 적용</p>
                  <p>고점 11,500원 × 92% = <strong>10,580원</strong> = 트레일링 스탑</p>
                  <p>현재 10,950원(+9.5%) &gt; 10,580원 → <strong>🟢 HOLD (청산 안 함)</strong></p>
                  <p className="mt-1 text-xs opacity-80">단, +15% 시점에 이미 50% 부분 익절 완료 → 나머지는 공짜 포지션으로 트레일링</p>
                </InfoBox>
              </article>
            </div>
          </Section>

          {/* ── IC 팩터 검증 ── */}
          <Section id="ic" eyebrow="VALIDATION" title="IC — 팩터 예측력 검증">
            <div className="flex flex-col gap-4">
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">IC (Information Coefficient)</h3>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                  <code className="text-xs text-slate-800">IC = Spearman(예측점수 순위, 실제수익률 순위)</code>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  팩터 점수와 이후 실제 수익률 사이의 순위 상관관계입니다.
                  IC가 높을수록 모델이 실제로 예측력이 있다는 뜻입니다.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-4 text-sm text-center">
                  {[
                    ["IC ≥ 0.10","🔥 우수","지속적 초과수익 기대"],
                    ["IC ≥ 0.05","✅ 양호","유의미한 예측력"],
                    ["IC ≥ 0.02","⚠️ 약함","데이터 추가 필요"],
                    ["IC < 0","❌ 역방향","가중치 재검토"],
                  ].map(([range, icon, desc]) => (
                    <div key={range} className="rounded-lg border border-[var(--border)] px-3 py-3">
                      <p className="font-bold text-[var(--text-1)] text-xs">{range}</p>
                      <p className="text-lg mt-1">{icon}</p>
                      <p className="text-xs text-[var(--text-3)] mt-1">{desc}</p>
                    </div>
                  ))}
                </div>

                <h4 className="mt-5 font-bold text-[var(--text-1)]">ICIR (IC Information Ratio)</h4>
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
                  <code className="text-xs text-slate-800">ICIR = 평균IC ÷ IC표준편차</code>
                </div>
                <p className="mt-2 text-sm text-[var(--text-2)]">
                  ICIR ≥ 0.5이면 IC가 안정적. 아무리 높은 IC라도 월마다 들쭉날쭉하면 신뢰하기 어렵습니다.
                </p>

                <h4 className="mt-5 font-bold text-[var(--text-1)]">ML 모델 평가 지표 (스나이퍼용)</h4>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs text-[var(--text-3)]">
                        <th className="px-3 py-2">지표</th><th className="px-3 py-2">설명</th><th className="px-3 py-2">목표</th>
                      </tr>
                    </thead>
                    <tbody className="text-[var(--text-2)]">
                      {[
                        ["Precision@0.60","60% 이상 확신한 예측의 적중률","≥ 30%"],
                        ["EV (기대값)","(성공확률×+7%) + (실패확률×-5%)","≥ 0%"],
                        ["타겟","3 거래일 후 7%+ 달성 여부 (1/0)","클래스 비율 5~15%"],
                      ].map(([t,d,g]) => (
                        <tr key={t} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-bold">{t}</td>
                          <td className="px-3 py-2">{d}</td>
                          <td className="px-3 py-2 text-blue-700 font-bold">{g}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <InfoBox color="orange">
                  <strong>IC 측정 방법</strong>: <code>python eval_factor_ic.py --skip-forward</code> 실행. 데이터는 railway_job.py morning 실행 시 매일 prediction_log 테이블에 자동 누적되며, 최소 30일치가 필요합니다.
                </InfoBox>
              </article>
            </div>
          </Section>

          {/* ── 시장 국면 ── */}
          <Section id="regime" eyebrow="MARKET REGIME" title="시장 국면 탐지 (4개 지표)">
            <div className="flex flex-col gap-4">
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">국면 판별 로직</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  YouTube 단일 감성에만 의존하던 방식을 개선해, <strong>4개 지표 중 3개 이상 부정이면 BEAR</strong>로 판단합니다.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["① YouTube 감성","7일 유튜브 영상 중 '부정' 비율 > 60%"],
                    ["② KOSPI MA20","코스피 현재가가 20일 이동평균 아래"],
                    ["③ 외국인 5일 수급","외국인 5일 누적 순매수 음수 (매도 우위)"],
                    ["④ 뉴스 감성","최근 뉴스 악재 비율 > 50%"],
                  ].map(([title, rule]) => (
                    <div key={title} className="rounded-lg border border-[var(--border)] p-3">
                      <p className="font-bold text-sm text-[var(--text-1)]">{title}</p>
                      <p className="text-xs text-[var(--text-2)] mt-1">{rule}</p>
                    </div>
                  ))}
                </div>

                <h4 className="mt-5 font-bold text-[var(--text-1)]">히스테리시스 (Hysteresis)</h4>
                <p className="mt-2 text-sm text-[var(--text-2)]">
                  국면이 빈번하게 바뀌는 것을 방지합니다. BEAR 진입은 신호 3개 이상, BEAR 탈출은 신호 2개 미만 — 기준이 비대칭입니다.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3 text-sm text-center">
                  {[
                    ["🐻 BEAR","신호 ≥ 3개 → 진입\n신호 < 2개 → 탈출","진입 기준 강화\n타이밍 점수 ×0.8"],
                    ["😐 NEUTRAL","기본 상태","표준 기준 적용"],
                    ["🐂 BULL","향후 구현 예정","진입 기준 완화"],
                  ].map(([regime, rule, effect]) => (
                    <div key={regime} className="rounded-lg border border-[var(--border)] px-3 py-3">
                      <p className="font-bold text-[var(--text-1)]">{regime}</p>
                      <p className="text-xs text-[var(--text-2)] mt-1 whitespace-pre-line">{rule}</p>
                      <p className="text-xs text-blue-600 mt-2 font-medium">{effect}</p>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </Section>

        </div>
      </div>
    </main>
  );
}
