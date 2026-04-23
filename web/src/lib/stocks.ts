// 섹터 정의
export type Sector =
  | "반도체"
  | "2차전지/에너지"
  | "바이오"
  | "자동차"
  | "IT/플랫폼"
  | "금융"
  | "소재/산업재"
  | "조선"
  | "방산"
  | "원자력"
  | "건설"
  | "우주항공"
  | "화장품"
  | "로봇"
  | "광통신"
  | "ETF/국내"
  | "ETF/해외"
  | "ETF/테마"
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
  { ticker: "058470.KS", name: "리노공업", sector: "반도체" },
  { ticker: "000990.KS", name: "DB하이텍", sector: "반도체" },
  { ticker: "403870.KQ", name: "HPSP", sector: "반도체" },
  { ticker: "101490.KQ", name: "에스앤에스텍", sector: "반도체" },
  { ticker: "240810.KQ", name: "원익IPS", sector: "반도체" },
  { ticker: "095610.KQ", name: "테스", sector: "반도체" },
  { ticker: "140860.KQ", name: "파크시스템스", sector: "반도체" },
  { ticker: "067310.KQ", name: "하나마이크론", sector: "반도체" },
  { ticker: "033170.KQ", name: "시그네틱스", sector: "반도체" },
  { ticker: "033640.KQ", name: "네패스", sector: "반도체" },
  { ticker: "036540.KQ", name: "SFA반도체", sector: "반도체" },
  // 2차전지/에너지
  { ticker: "373220.KS", name: "LG에너지솔루션", sector: "2차전지/에너지" },
  { ticker: "051910.KS", name: "LG화학", sector: "2차전지/에너지" },
  { ticker: "006400.KS", name: "삼성SDI", sector: "2차전지/에너지" },
  { ticker: "096770.KS", name: "SK이노베이션", sector: "2차전지/에너지" },
  { ticker: "003670.KS", name: "포스코퓨처엠", sector: "2차전지/에너지" },
  { ticker: "247540.KQ", name: "에코프로비엠", sector: "2차전지/에너지" },
  { ticker: "086520.KQ", name: "에코프로", sector: "2차전지/에너지" },
  { ticker: "005490.KS", name: "POSCO홀딩스", sector: "2차전지/에너지" },
  { ticker: "078590.KQ", name: "대주전자재료", sector: "2차전지/에너지" },
  { ticker: "322000.KS", name: "HD현대에너지솔루션", sector: "2차전지/에너지" },
  { ticker: "009830.KS", name: "한화솔루션", sector: "2차전지/에너지" },
  { ticker: "475150.KQ", name: "SK이터닉스", sector: "2차전지/에너지" },
  { ticker: "100090.KS", name: "SK오션플랜트", sector: "2차전지/에너지" },
  { ticker: "011930.KQ", name: "신성이엔지", sector: "2차전지/에너지" },
  { ticker: "010060.KS", name: "OCI홀딩스", sector: "2차전지/에너지" },
  { ticker: "229640.KS", name: "LS에코에너지", sector: "2차전지/에너지" },
  { ticker: "015760.KS", name: "한국전력", sector: "2차전지/에너지" },
  { ticker: "112610.KS", name: "씨에스윈드", sector: "2차전지/에너지" },
  { ticker: "389260.KQ", name: "대명에너지", sector: "2차전지/에너지" },
  { ticker: "060370.KQ", name: "LS마린솔루션", sector: "2차전지/에너지" },
  // 바이오
  { ticker: "207940.KS", name: "삼성바이오로직스", sector: "바이오" },
  { ticker: "068270.KS", name: "셀트리온", sector: "바이오" },
  { ticker: "196170.KQ", name: "알테오젠", sector: "바이오" },
  { ticker: "000100.KS", name: "유한양행", sector: "바이오" },
  { ticker: "028300.KS", name: "HLB", sector: "바이오" },
  { ticker: "000250.KS", name: "삼천당제약", sector: "바이오" },
  { ticker: "298380.KQ", name: "에이비엘바이오", sector: "바이오" },
  { ticker: "087010.KQ", name: "펩트론", sector: "바이오" },
  { ticker: "237690.KQ", name: "에스티팜", sector: "바이오" },
  { ticker: "468530.KQ", name: "프로티나", sector: "바이오" },
  { ticker: "950160.KQ", name: "코오롱티슈진", sector: "바이오" },
  { ticker: "376900.KQ", name: "로킷헬스케어", sector: "바이오" },
  { ticker: "458870.KQ", name: "씨어스", sector: "바이오" },
  // 자동차
  { ticker: "005380.KS", name: "현대차", sector: "자동차" },
  { ticker: "000270.KS", name: "기아", sector: "자동차" },
  { ticker: "012330.KS", name: "현대모비스", sector: "자동차" },
  { ticker: "204320.KS", name: "HL만도", sector: "자동차" },
  { ticker: "086280.KS", name: "현대글로비스", sector: "자동차" },
  // IT/플랫폼
  { ticker: "035420.KS", name: "NAVER", sector: "IT/플랫폼" },
  { ticker: "035720.KS", name: "카카오", sector: "IT/플랫폼" },
  { ticker: "030200.KS", name: "KT", sector: "IT/플랫폼" },
  { ticker: "017670.KS", name: "SK텔레콤", sector: "IT/플랫폼" },
  { ticker: "323410.KS", name: "카카오뱅크", sector: "IT/플랫폼" },
  { ticker: "259960.KS", name: "크래프톤", sector: "IT/플랫폼" },
  { ticker: "124500.KQ", name: "아이티센글로벌", sector: "IT/플랫폼" },
  // 금융
  { ticker: "055550.KS", name: "신한지주", sector: "금융" },
  { ticker: "105560.KS", name: "KB금융", sector: "금융" },
  { ticker: "086790.KS", name: "하나금융지주", sector: "금융" },
  { ticker: "316140.KS", name: "우리금융지주", sector: "금융" },
  { ticker: "032830.KS", name: "삼성생명", sector: "금융" },
  { ticker: "138040.KS", name: "메리츠금융지주", sector: "금융" },
  { ticker: "071050.KS", name: "한국금융지주", sector: "금융" },
  { ticker: "016360.KS", name: "삼성증권", sector: "금융" },
  { ticker: "001720.KS", name: "신영증권", sector: "금융" },
  { ticker: "003530.KS", name: "한화투자증권", sector: "금융" },
  { ticker: "001510.KS", name: "SK증권", sector: "금융" },
  { ticker: "003540.KS", name: "대신증권", sector: "금융" },
  { ticker: "039490.KS", name: "키움증권", sector: "금융" },
  // 소재/산업재
  { ticker: "003550.KS", name: "LG", sector: "소재/산업재" },
  { ticker: "034730.KS", name: "SK", sector: "소재/산업재" },
  { ticker: "028260.KS", name: "삼성물산", sector: "소재/산업재" },
  { ticker: "066570.KS", name: "LG전자", sector: "소재/산업재" },
  { ticker: "010130.KS", name: "고려아연", sector: "소재/산업재" },
  { ticker: "011200.KS", name: "HMM", sector: "소재/산업재" },
  { ticker: "097950.KS", name: "CJ제일제당", sector: "소재/산업재" },
  { ticker: "047050.KS", name: "포스코인터내셔널", sector: "소재/산업재" },
  { ticker: "127120.KS", name: "제이에스링크", sector: "소재/산업재" },
  // AI 전력인프라
  { ticker: "267260.KS", name: "HD현대일렉트릭", sector: "소재/산업재" },
  { ticker: "130660.KS", name: "한전산업", sector: "소재/산업재" },
  { ticker: "298040.KS", name: "효성중공업", sector: "소재/산업재" },
  { ticker: "001440.KS", name: "대한전선", sector: "소재/산업재" },
  { ticker: "062040.KS", name: "산일전기", sector: "소재/산업재" },
  { ticker: "003720.KS", name: "삼영", sector: "소재/산업재" },
  { ticker: "103590.KS", name: "일진전기", sector: "소재/산업재" },
  { ticker: "010120.KS", name: "LS ELECTRIC", sector: "소재/산업재" },
  // 조선
  { ticker: "009540.KS", name: "HD한국조선해양", sector: "조선" },
  { ticker: "010140.KS", name: "삼성중공업", sector: "조선" },
  { ticker: "329180.KS", name: "HD현대중공업", sector: "조선" },
  { ticker: "042660.KS", name: "한화오션", sector: "조선" },
  { ticker: "010620.KS", name: "현대미포조선", sector: "조선" },
  { ticker: "460930.KQ", name: "현대힘스", sector: "조선" },
  { ticker: "023160.KS", name: "태광", sector: "조선" },
  { ticker: "017960.KS", name: "한국카본", sector: "조선" },
  { ticker: "082740.KS", name: "한화엔진", sector: "조선" },
  { ticker: "077970.KS", name: "STX엔진", sector: "조선" },
  // 방산
  { ticker: "012450.KS", name: "한화에어로스페이스", sector: "방산" },
  { ticker: "079550.KS", name: "LIG넥스원", sector: "방산" },
  { ticker: "064350.KS", name: "현대로템", sector: "방산" },
  { ticker: "272210.KS", name: "한화시스템", sector: "방산" },
  { ticker: "000880.KS", name: "한화", sector: "방산" },
  { ticker: "010820.KS", name: "퍼스텍", sector: "방산" },
  { ticker: "103140.KS", name: "풍산", sector: "방산" },
  // 원자력
  { ticker: "034020.KS", name: "두산에너빌리티", sector: "원자력" },
  { ticker: "052690.KS", name: "한전기술", sector: "원자력" },
  { ticker: "051600.KS", name: "한전KPS", sector: "원자력" },
  { ticker: "014620.KS", name: "성광벤드", sector: "원자력" },
  { ticker: "119850.KQ", name: "지엔씨에너지", sector: "원자력" },
  { ticker: "083650.KQ", name: "비에이치아이", sector: "원자력" },
  { ticker: "105840.KQ", name: "우진", sector: "원자력" },
  { ticker: "019990.KS", name: "에너토크", sector: "원자력" },
  { ticker: "098070.KQ", name: "한텍", sector: "원자력" },
  { ticker: "096350.KQ", name: "대창솔루션", sector: "원자력" },
  { ticker: "376180.KQ", name: "피코그램", sector: "원자력" },
  { ticker: "006910.KQ", name: "보성파워텍", sector: "원자력" },
  // 핵융합
  { ticker: "042370.KQ", name: "비츠로테크", sector: "원자력" },
  { ticker: "189860.KQ", name: "서전기전", sector: "원자력" },
  { ticker: "094820.KQ", name: "일진파워", sector: "원자력" },
  // 건설
  { ticker: "047040.KS", name: "대우건설", sector: "건설" },
  { ticker: "006360.KS", name: "GS건설", sector: "건설" },
  { ticker: "000720.KS", name: "현대건설", sector: "건설" },
  // 우주항공
  { ticker: "073490.KQ", name: "LIG아큐버", sector: "우주항공" },
  { ticker: "047810.KS", name: "한국항공우주", sector: "우주항공" },
  { ticker: "189300.KQ", name: "인텔리안테크", sector: "우주항공" },
  { ticker: "099320.KQ", name: "쎄트렉아이", sector: "우주항공" },
  { ticker: "462350.KQ", name: "이노스페이스", sector: "우주항공" },
  { ticker: "082920.KQ", name: "비츠로넥스텍", sector: "우주항공" },
  { ticker: "441270.KQ", name: "나라스페이스테크놀로지", sector: "우주항공" },
  { ticker: "274090.KQ", name: "켄코아에어로스페이스", sector: "우주항공" },
  { ticker: "272290.KQ", name: "이녹스첨단소재", sector: "우주항공" },
  // 화장품
  { ticker: "257720.KQ", name: "실리콘투", sector: "화장품" },
  { ticker: "278470.KQ", name: "에이피알", sector: "화장품" },
  { ticker: "123690.KS", name: "한국화장품", sector: "화장품" },
  { ticker: "192820.KS", name: "코스맥스", sector: "화장품" },
  { ticker: "090430.KS", name: "아모레퍼시픽", sector: "화장품" },
  { ticker: "027050.KS", name: "코리아나", sector: "화장품" },
  { ticker: "161890.KS", name: "한국콜마", sector: "화장품" },
  { ticker: "214420.KQ", name: "토니모리", sector: "화장품" },
  // 로봇
  { ticker: "267250.KS", name: "HD현대", sector: "로봇" },
  { ticker: "277810.KQ", name: "레인보우로보틱스", sector: "로봇" },
  { ticker: "090360.KQ", name: "로보스타", sector: "로봇" },
  { ticker: "454910.KQ", name: "두산로보틱스", sector: "로봇" },
  { ticker: "056190.KQ", name: "에스에프에이", sector: "로봇" },
  { ticker: "108490.KQ", name: "로보티즈", sector: "로봇" },
  { ticker: "090710.KQ", name: "휴림로봇", sector: "로봇" },
  // 광통신
  { ticker: "046970.KQ", name: "우리로", sector: "광통신" },
  { ticker: "038680.KQ", name: "에스넷", sector: "광통신" },
  { ticker: "010170.KQ", name: "대한광통신", sector: "광통신" },
  { ticker: "043260.KQ", name: "성호전자", sector: "광통신" },
  { ticker: "115440.KQ", name: "우리넷", sector: "광통신" },
  { ticker: "037030.KQ", name: "파워넷", sector: "광통신" },
  { ticker: "100130.KQ", name: "AP위성", sector: "광통신" },
  // ETF/국내 (코스피/코스닥 주요 ETF)
  { ticker: "069500.KS", name: "KODEX 200", sector: "ETF/국내" },
  { ticker: "229200.KS", name: "KODEX 코스닥150", sector: "ETF/국내" },
  { ticker: "122630.KS", name: "KODEX 레버리지", sector: "ETF/국내" },
  { ticker: "091160.KS", name: "KODEX 반도체", sector: "ETF/국내" },
  { ticker: "305720.KS", name: "KODEX 2차전지산업", sector: "ETF/국내" },
  { ticker: "139230.KS", name: "TIGER 화장품", sector: "ETF/국내" },
  { ticker: "139260.KS", name: "TIGER 방산&우주", sector: "ETF/국내" },
  { ticker: "385510.KS", name: "TIGER 조선TOP10", sector: "ETF/국내" },
  { ticker: "476850.KS", name: "KoAct배당성장액티브", sector: "ETF/국내" },
  { ticker: "233740.KS", name: "KODEX 코스닥150레버리지", sector: "ETF/국내" },
  { ticker: "138540.KS", name: "TIGER 현대차그룹플러스", sector: "ETF/국내" },
  // ETF/해외 (미국/글로벌 지수 추종)
  { ticker: "360750.KS", name: "TIGER 미국S&P500", sector: "ETF/해외" },
  { ticker: "379800.KS", name: "KODEX 미국S&P500TR", sector: "ETF/해외" },
  { ticker: "133690.KS", name: "TIGER 미국나스닥100", sector: "ETF/해외" },
  { ticker: "267490.KS", name: "KODEX 나스닥100TR", sector: "ETF/해외" },
  { ticker: "195930.KS", name: "TIGER 해외상장리츠", sector: "ETF/해외" },
  { ticker: "251350.KS", name: "KODEX 선진국MSCI", sector: "ETF/해외" },
  { ticker: "192090.KS", name: "TIGER 차이나CSI300", sector: "ETF/해외" },
  { ticker: "329650.KS", name: "TIGER 미국필라델피아반도체나스닥", sector: "ETF/해외" },
  // ETF/테마 (AI·로봇·헬스케어 등)
  { ticker: "364980.KS", name: "TIGER Fn반도체TOP10", sector: "ETF/테마" },
  { ticker: "472160.KS", name: "TIGER AI반도체핵심소재", sector: "ETF/테마" },
  { ticker: "411040.KS", name: "ACE 로보틱스&AI", sector: "ETF/테마" },
  { ticker: "459580.KS", name: "KODEX 미국AI전력인프라", sector: "ETF/테마" },
  { ticker: "302640.KS", name: "TIGER 차세대전기차&배터리", sector: "ETF/테마" },
  { ticker: "334700.KS", name: "KODEX 바이오", sector: "ETF/테마" },
  { ticker: "441800.KS", name: "TIGER 방산", sector: "ETF/테마" },
  { ticker: "433500.KS", name: "ACE 원자력TOP10", sector: "ETF/테마" },
  { ticker: "396500.KS", name: "TIGER 반도체TOP10", sector: "ETF/테마" },
  { ticker: "469150.KS", name: "ACE AI반도체TOP3+", sector: "ETF/테마" },
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
  ["유한", "000100.KS"],
  ["메리츠", "138040.KS"],
  ["카뱅", "323410.KS"],
  ["아모레", "090430.KS"],
  ["에코프로비엠", "247540.KQ"],
  ["KAI", "047810.KS"],
  ["현대로보틱스", "267250.KS"],
  ["HD현대로보틱스", "267250.KS"],
  ["포스코", "005490.KS"],
  ["코스피", "^KS11"],
  ["코스닥", "^KQ11"],
  ["S&P500", "360750.KS"],
  ["SP500", "360750.KS"],
  ["나스닥", "133690.KS"],
  ["나스닥100", "133690.KS"],
  ["코덱스200", "069500.KS"],
  ["코덱스레버리지", "122630.KS"],
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
