import { supabase } from "./supabase";
import type { YoutubeInsight, MarketSentiment } from "./types";

export async function getLatestInsights(
  limit: number = 20
): Promise<YoutubeInsight[]> {
  const { data, error } = await supabase
    .from("youtube_insights")
    .select("*")
    .order("processed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function searchByStock(
  stockName: string,
  limit: number = 10
): Promise<YoutubeInsight[]> {
  const { data, error } = await supabase
    .from("youtube_insights")
    .select("*")
    .or(
      `key_stocks.cs.{${stockName}},title.ilike.%${stockName}%,summary.ilike.%${stockName}%`
    )
    .order("processed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getMarketSentiment(): Promise<MarketSentiment> {
  const { data, error } = await supabase
    .from("youtube_insights")
    .select("market_sentiment")
    .order("processed_at", { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    return {
      score: 0,
      label: "중립",
      count: 0,
      details: { 긍정: 0, 중립: 0, 부정: 0 },
    };
  }

  const sentimentMap: Record<string, number> = {
    긍정: 1,
    중립: 0,
    부정: -1,
  };

  const scores = data.map(
    (d) => sentimentMap[d.market_sentiment] ?? 0
  );
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const label = avg > 0.2 ? "긍정" : avg < -0.2 ? "부정" : "중립";

  return {
    score: Math.round(avg * 100) / 100,
    label,
    count: data.length,
    details: {
      긍정: scores.filter((s) => s === 1).length,
      중립: scores.filter((s) => s === 0).length,
      부정: scores.filter((s) => s === -1).length,
    },
  };
}

export async function getTopMentionedStocks(
  days: number = 7,
  limit: number = 10
): Promise<{ name: string; count: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("youtube_insights")
    .select("key_stocks")
    .gte("processed_at", since.toISOString());

  if (error || !data) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    const stocks = row.key_stocks || [];
    for (const stock of stocks) {
      counts[stock] = (counts[stock] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
