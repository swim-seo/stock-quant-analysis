// Shared types used by both API routes and client components

export interface SectorFundamental {
  avgPER: number | null;
  avgPBR: number | null;
  avgAnalystRating: number | null;
  analystLabel: string;
  valuationLabel: string;
}

export type EntryGrade = "매력적" | "적정" | "주의" | "위험";

export interface StockHeat {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  volume: number;
  tradingValue: number;
  volumeRatio: number;
}

export interface SectorHeat {
  sector: string;
  totalValue: number;
  avgChangePct: number;
  stocks: StockHeat[];
}

export interface ComponentScore {
  score: number;
  label: string;
  detail: string;
}

export type RotationPhase = "침체" | "진입기" | "상승기" | "과열" | "하락기";

export interface SectorFearGreed {
  sector: string;
  total: number;
  label: "극도의 공포" | "공포" | "중립" | "탐욕" | "극도의 탐욕";
  signal: "매수관심" | "관찰" | "중립";
  weeklyTrend: number[];
  rotationPhase: RotationPhase;
  rotationNote: string;
  components: {
    rsi: ComponentScore;
    maBreadth: ComponentScore;
    momentum: ComponentScore;
    volume: ComponentScore;
    youtube: ComponentScore;
  };
  topStocks: { name: string; ticker: string; changePct: number; rsi: number }[];
  investorFlow: { foreign5d: number; institution5d: number };
  fundamental: SectorFundamental;
  entryGrade: EntryGrade;
  entryReason: string;
}
