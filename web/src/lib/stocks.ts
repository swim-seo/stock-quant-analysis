// 섹터 정의
export type Sector =
  | "반도체"
  | "2차전지/에너지"
  | "바이오"
  | "자동차"
  | "IT/플랫폼"
  | "금융"
  | "소재/산업재"
  | "지수";

export interface StockInfo {
  ticker: string;
  name: string;
  sector: Sector;
}

// 종목 마스터 데이터 (섹터 포함)
export const STOCKS: StockInfo[] = [
  // 반도체
  { ticker: "005930.KS", name: "삼성전자", sector: "반도체" },
  { ticker: "000660.KS", name: "SK하이닉스", sector: "반도체" },
  { ticker: "042700.KS", name: "한미반도체", sector: "반도체" },
  { ticker: "009150.KS", name: "삼성전기", sector: "반도체" },
  // 2차전지/에너지
  { ticker: "373220.KS", name: "LG에너지솔루션", sector: "2차전지/에너지" },
  { ticker: "051910.KS", name: "LG화학", sector: "2차전지/에너지" },
  { ticker: "006400.KS", name: "삼성SDI", sector: "2차전지/에너지" },
  { ticker: "096770.KS", name: "SK이노베이션", sector: "2차전지/에너지" },
  { ticker: "003670.KS", name: "포스코퓨처엠", sector: "2차전지/에너지" },
  { ticker: "247540.KQ", name: "에코프로비엠", sector: "2차전지/에너지" },
  { ticker: "383220.KQ", name: "에코프로", sector: "2차전지/에너지" },
  // 바이오
  { ticker: "207940.KS", name: "삼성바이오로직스", sector: "바이오" },
  { ticker: "068270.KS", name: "셀트리온", sector: "바이오" },
  { ticker: "460850.KQ", name: "알테오젠", sector: "바이오" },
  // 자동차
  { ticker: "005380.KS", name: "현대차", sector: "자동차" },
  { ticker: "000270.KS", name: "기아", sector: "자동차" },
  { ticker: "012330.KS", name: "현대모비스", sector: "자동차" },
  // IT/플랫폼
  { ticker: "035420.KS", name: "NAVER", sector: "IT/플랫폼" },
  { ticker: "035720.KS", name: "카카오", sector: "IT/플랫폼" },
  { ticker: "030200.KS", name: "KT", sector: "IT/플랫폼" },
  { ticker: "017670.KS", name: "SK텔레콤", sector: "IT/플랫폼" },
  // 금융
  { ticker: "055550.KS", name: "신한지주", sector: "금융" },
  { ticker: "105560.KS", name: "KB금융", sector: "금융" },
  { ticker: "086790.KS", name: "하나금융지주", sector: "금융" },
  { ticker: "316140.KS", name: "우리금융지주", sector: "금융" },
  { ticker: "032830.KS", name: "삼성생명", sector: "금융" },
  // 소재/산업재
  { ticker: "003550.KS", name: "LG", sector: "소재/산업재" },
  { ticker: "034730.KS", name: "SK", sector: "소재/산업재" },
  { ticker: "028260.KS", name: "삼성물산", sector: "소재/산업재" },
  { ticker: "066570.KS", name: "LG전자", sector: "소재/산업재" },
  { ticker: "010130.KS", name: "고려아연", sector: "소재/산업재" },
  { ticker: "011200.KS", name: "HMM", sector: "소재/산업재" },
  { ticker: "009540.KS", name: "한국조선해양", sector: "소재/산업재" },
];

// 한글 종목명 → 종목코드 매핑 (자동 생성)
export const NAME_TO_TICKER: Record<string, string> = Object.fromEntries([
  ...STOCKS.map((s) => [s.name, s.ticker]),
  // 별칭
  ["삼전", "005930.KS"],
  ["하이닉스", "000660.KS"],
  ["현차", "005380.KS"],
  ["네이버", "035420.KS"],
  ["삼바", "207940.KS"],
  ["삼성바이오", "207940.KS"],
  ["기아차", "000270.KS"],
  ["LG엔솔", "373220.KS"],
  ["엔솔", "373220.KS"],
  ["코스피", "^KS11"],
  ["코스닥", "^KQ11"],
]);

// 종목코드 → 한글명 (자동 생성)
export const TICKER_TO_NAME: Record<string, string> = Object.fromEntries([
  ...STOCKS.map((s) => [s.ticker, s.name]),
  ["^KS11", "코스피 지수"],
  ["^KQ11", "코스닥 지수"],
]);

// 종목코드 → 섹터 (자동 생성)
export const TICKER_TO_SECTOR: Record<string, Sector> = Object.fromEntries(
  STOCKS.map((s) => [s.ticker, s.sector])
);

// 섹터별 종목 그룹
export const STOCKS_BY_SECTOR: Record<Sector, StockInfo[]> = STOCKS.reduce(
  (acc, stock) => {
    if (!acc[stock.sector]) acc[stock.sector] = [];
    acc[stock.sector].push(stock);
    return acc;
  },
  {} as Record<Sector, StockInfo[]>
);

// 전체 섹터 목록
export const SECTORS: Sector[] = [...new Set(STOCKS.map((s) => s.sector))];

export function resolveTickerInput(input: string): string {
  const trimmed = input.trim();
  return NAME_TO_TICKER[trimmed] || trimmed;
}
