export interface StockAnalysis {
  name: string;
  signal: "매수" | "관망" | "매도";
  sentiment: "긍정" | "중립" | "부정";
  reason: string;
  price_target: string | null;
  support: string | null;
  resistance: string | null;
  risk: string | null;
}

export interface YoutubeInsight {
  video_id: string;
  title: string;
  channel: string;
  url: string;
  upload_date: string | null;
  processed_at: string;
  summary: string;
  market_sentiment: "긍정" | "중립" | "부정";
  market_narrative?: string;
  key_stocks: string[];
  key_stocks_analysis?: string;
  key_events?: string;
  key_sectors: string[];
  keywords: string[];
  investment_signals: string;
  risk_factors: string;
  trading_type: "단타" | "스윙" | "장기";
  urgency: "오늘" | "이번주" | "장기";
  playlist?: string;
  trading_focus?: string;
}

export interface MarketSentiment {
  score: number;
  label: string;
  count: number;
  details: {
    긍정: number;
    중립: number;
    부정: number;
  };
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}
