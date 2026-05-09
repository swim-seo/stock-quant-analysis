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
    desc: "시장 전체 흐름을 빼고도 종목이 얼마나 강한지 보는 지표입니다. RS가 양수(+)이면 코스피보다 강하게 올랐다는 뜻이며, 퀀트 스크리너에서 25% 비중으로 반영됩니다.",
  },
  {
    term: "볼린저밴드",
    formula: "중심선(MA20) ± 2 × 표준편차",
    desc: "가격이 평균에서 얼마나 떨어져 있는지 변동성 범위로 보여줍니다. 밴드가 좁아지면 변동성 축소, 이후 밴드가 벌어지면 방향성 움직임이 커질 수 있습니다.",
  },
  {
    term: "MACD",
    formula: "MACD선 = 12일 EMA - 26일 EMA, 시그널선 = MACD의 9일 EMA",
    desc: "두 지수이동평균의 차이로 추세 전환과 모멘텀 변화를 확인합니다. MACD선이 시그널선을 위로 넘으면 상승 전환 신호로 해석할 수 있습니다.",
  },
  {
    term: "거래량",
    formula: "당일 거래량 ÷ 20일 평균 거래량",
    desc: "가격 움직임에 참여한 힘의 크기입니다. 상승과 함께 거래량이 늘면 신뢰도가 높고, 이 대시보드는 당일 거래량이 20일 평균의 1.2배를 넘는지를 확인합니다.",
  },
  {
    term: "모멘텀",
    formula: "현재가 ÷ 과거 기준가 - 1",
    desc: "일정 기간 동안 가격이 얼마나 강하게 움직였는지 보는 지표입니다. 최근 강한 종목이 당분간 강세를 이어가는 경향을 포착하기 위해 사용합니다.",
  },
];

const entryConditions = [
  ["이동평균 정배열", "MA5 > MA20 > MA60"],
  ["골든크로스", "최근 10거래일 안에 MA5가 MA20 상향 돌파"],
  ["RSI 구간", "RSI 40~60"],
  ["주간 추세 게이트", "주봉 기준 상승 추세 통과"],
  ["거래량 확인", "당일 거래량 > 1.2 × 20일 평균 거래량"],
];

function TermCard({
  term,
  formula,
  desc,
}: {
  term: string;
  formula: string;
  desc: string;
}) {
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

function Section({
  id,
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
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

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-white px-6 py-3">
        <div className="mx-auto flex max-w-[980px] items-center justify-between gap-4">
          <Link href="/" className="no-underline">
            <p className="m-0 text-[10px] font-bold tracking-[0.18em] text-[var(--blue)]">
              KOREA STOCK AI
            </p>
            <h1 className="m-0 text-xl font-extrabold text-[var(--text-1)]">
              용어 & 방법론 가이드
            </h1>
          </Link>
          <Link href="/" className="shrink-0 text-sm font-semibold text-[var(--text-3)] no-underline">
            ← 대시보드
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[980px] px-6 py-7">
        <nav className="sticky top-0 z-10 -mx-6 border-b border-[var(--border)] bg-[rgba(242,244,246,0.94)] px-6 py-3 backdrop-blur">
          <div className="flex gap-2 overflow-x-auto">
            {[
              ["재무지표", "#financial"],
              ["기술지표", "#technical"],
              ["분석방법론", "#methodology"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="shrink-0 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-bold text-[var(--text-2)] no-underline"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="mt-8 flex flex-col gap-12">
          <Section id="financial" eyebrow="FINANCIAL" title="재무지표">
            <div className="grid gap-4 md:grid-cols-2">
              {financialTerms.map((item) => (
                <TermCard key={item.term} {...item} />
              ))}
            </div>
          </Section>

          <Section id="technical" eyebrow="TECHNICAL" title="기술지표">
            <div className="grid gap-4 md:grid-cols-2">
              {technicalTerms.map((item) => (
                <TermCard key={item.term} {...item} />
              ))}
            </div>
          </Section>

          <Section id="methodology" eyebrow="METHODOLOGY" title="분석방법론">
            <div className="flex flex-col gap-4">

              {/* 진입신호 5조건 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">진입신호 5조건</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">
                  종목 상세 페이지에서 아래 5가지 조건을 채점해 진입 적합성을 판단합니다.
                </p>
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
                  <div className="rounded-lg border border-emerald-100 px-3 py-3 text-sm text-[var(--text-2)]">
                    <strong className="text-emerald-700">🟢 4점 이상</strong><br />진입 후보
                  </div>
                  <div className="rounded-lg border border-amber-100 px-3 py-3 text-sm text-[var(--text-2)]">
                    <strong className="text-amber-700">🟡 2.5~3.5점</strong><br />대기
                  </div>
                  <div className="rounded-lg border border-rose-100 px-3 py-3 text-sm text-[var(--text-2)]">
                    <strong className="text-rose-700">🔴 2.5점 미만</strong><br />위험
                  </div>
                </div>
              </article>

              {/* 퀀트 스크리너 종합점수 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">퀀트 스크리너 — 팩터 랭킹 공식</h3>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                  <code className="text-xs text-slate-800">
                    종합점수 = 모멘텀 40% + 상대강도(RS) 25% + 저변동성 15% + 수급(flow) 20%
                  </code>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  131개 종목 각각의 팩터를 Z-score로 정규화한 뒤 가중합산합니다. 그 결과를 0~100 percentile로
                  변환하므로 <strong>100점 = 131개 중 최상단 이상치</strong>를 뜻합니다.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-5 text-sm text-center">
                  {[
                    ["75~100", "최상위", "#f04452"],
                    ["55~75", "상위·진입검토", "#00b493"],
                    ["40~55", "중립", "#f5a623"],
                    ["25~40", "하위", "#888"],
                    ["~25", "최하위", "#bbb"],
                  ].map(([range, label, color]) => (
                    <div key={range} style={{ borderColor: color }} className="rounded-lg border px-2 py-3">
                      <p style={{ color }} className="font-extrabold">{range}</p>
                      <p className="text-xs text-[var(--text-3)] mt-1">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  <strong>주의:</strong> 점수가 높다고 지금 사야 한다는 뜻이 아닙니다. 75점 이상은 이미 많이 오른
                  상태일 가능성이 높아 추격 매수 위험이 있습니다. <strong>55~75점 구간</strong>이 상승 초·중반으로
                  진입 검토에 적합합니다.
                </p>
              </article>

              {/* 매수타이밍 자동 선별 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">매수타이밍 자동 선별 기준</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  메인 화면 &ldquo;📈 매수타이밍&rdquo; 탭은 아래 기준으로 종목을 자동 선별합니다.
                </p>
                <div className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-[var(--text-2)] leading-7">
                  <p>① 퀀트 종합점수 <strong>45~78점</strong> 구간 필터 (과열·과냉 제외)</p>
                  <p>② 뉴스 분석에서 &ldquo;매수관심&rdquo; 신호 있으면 우선순위 상향</p>
                  <p>③ 외국인·기관 5일 순매수 여부 보너스 반영</p>
                  <p>④ 최종 최대 8개 종목 자동 추출</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  각 종목의 <strong>&ldquo;판단근거 ▼&rdquo;</strong> 버튼을 누르면 선정 이유가 항목별로 표시됩니다.
                  이 목록은 종목 상세 페이지의 진입신호 5조건과 함께 사용해야 최종 판단이 완성됩니다.
                </p>
              </article>

              {/* 저평가 우량주 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">저평가 우량주 선별 기준 (PBR + ROE 연동)</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  단순히 PBR이 낮다고 저평가 우량주로 보지 않습니다. 수익성(ROE)이 동반되지 않은 저PBR은
                  <strong> 가치함정(Value Trap)</strong>일 수 있습니다.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs text-[var(--text-3)]">
                        <th className="px-3 py-2 font-bold">조건</th>
                        <th className="px-3 py-2 font-bold">가점</th>
                        <th className="px-3 py-2 font-bold">설명</th>
                      </tr>
                    </thead>
                    <tbody className="text-[var(--text-2)]">
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-3 font-bold">PBR &lt; 0.5 + ROE &gt; 10%</td>
                        <td className="px-3 py-3 font-bold text-emerald-700">+30점</td>
                        <td className="px-3 py-3">수익성이 확인된 진짜 저평가 — 두 조건 동시 충족 필수</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-3 font-bold">PBR &lt; 1.0</td>
                        <td className="px-3 py-3 font-bold text-amber-700">+20점</td>
                        <td className="px-3 py-3">장부가 미만 거래 — ROE 확인 권장</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-3 font-bold">PER &lt; 8</td>
                        <td className="px-3 py-3 font-bold text-blue-600">+25점</td>
                        <td className="px-3 py-3">이익 대비 매우 낮은 주가</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-3 font-bold">ROE &gt; 15%</td>
                        <td className="px-3 py-3 font-bold text-emerald-700">+20점</td>
                        <td className="px-3 py-3">높은 자본 효율성</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-3 font-bold">부채비율 &lt; 100%</td>
                        <td className="px-3 py-3 font-bold text-blue-600">+15점</td>
                        <td className="px-3 py-3">재무 안전성 확보</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  합계 <strong>25점 미만</strong>이면 저평가 우량주 목록에서 제외됩니다.
                  배당수익률은 한국 시장에서 성장 정체·부실 신호와 겹치는 경우가 많아 평가에서 제외됐습니다.
                </p>
              </article>

              {/* 섹터 로테이션 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">섹터 로테이션 단계 계산법</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">
                  섹터별 최근 뉴스 감성, 수급, 가격 흐름을 합산해 현재 섹터가 시장을 주도하는지 판단합니다.
                  점수는 0~100으로 환산하며 70 이상은 선도, 50~70은 추격, 30~50은 주의, 30 미만은 회피
                  구간으로 해석합니다.
                </p>
              </article>

              {/* 공포탐욕 */}
              <article className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <h3 className="text-base font-extrabold text-[var(--text-1)]">공포탐욕 지수 — 5가지 구성요소</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs text-[var(--text-3)]">
                        <th className="px-3 py-2 font-bold">구성요소</th>
                        <th className="px-3 py-2 font-bold">측정 방법</th>
                      </tr>
                    </thead>
                    <tbody className="text-[var(--text-2)]">
                      {[
                        ["코스피 변동성", "최근 변동성이 낮을수록 탐욕"],
                        ["코스피 모멘텀", "최근 상승폭이 클수록 탐욕"],
                        ["거래량 모멘텀", "거래량 증가 = 참여 심리 강화"],
                        ["미국 CNN F&G", "글로벌 투자 심리 반영"],
                        ["유튜브 심리", "국내 투자 채널 감성 분석"],
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
        </div>
      </div>
    </main>
  );
}
