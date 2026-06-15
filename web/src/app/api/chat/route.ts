import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function buildContext(): Promise<string> {
  const [signalsRes, ytRes, newsRes] = await Promise.all([
    supabase
      .from("trade_signals")
      .select("ticker,stock_name,sector,signal,composite_score,market_regime,calculated_at")
      .order("composite_score", { ascending: false })
      .limit(40),
    supabase
      .from("youtube_insights")
      .select("upload_date,channel,key_stocks,investment_signals,market_sentiment")
      .order("processed_at", { ascending: false })
      .limit(6),
    supabase
      .from("stock_news")
      .select("stock_name,sentiment,trading_signal,news_impact_score")
      .order("news_impact_score", { ascending: false })
      .limit(10),
  ]);

  const signals = signalsRes.data ?? [];
  const buys = signals.filter((s) => s.signal === "BUY");
  const regime = signals[0]?.market_regime ?? "NEUTRAL";
  const calcAt = signals[0]?.calculated_at
    ? new Date(signals[0].calculated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "미확인";

  const ytLines = (ytRes.data ?? []).map((y) => {
    const ks: string[] = y.key_stocks ?? [];
    const sig: string[] = Array.isArray(y.investment_signals)
      ? y.investment_signals
      : [];
    return `- [${y.upload_date}] ${y.channel}: 언급종목 ${ks.slice(0, 5).join(", ")} / 감성: ${y.market_sentiment}\n  신호: ${sig.slice(0, 2).join(" | ")}`;
  });

  const newsLines = (newsRes.data ?? []).map(
    (n) => `- ${n.stock_name}: ${n.sentiment} | ${n.trading_signal} | ${n.news_impact_score}점`
  );

  return `[현재 시스템 데이터 — ${calcAt} 기준]
시장국면: ${regime}

[BUY 신호 종목 ${buys.length}개]
${buys.map((b) => `- ${b.stock_name}(${b.ticker}) | ${b.sector} | 점수:${b.composite_score}`).join("\n")}

[HOLD/SELL 상위]
${signals
  .filter((s) => s.signal !== "BUY")
  .slice(0, 5)
  .map((s) => `- ${s.stock_name}: ${s.signal} | 점수:${s.composite_score}`)
  .join("\n")}

[YouTube 최신 인사이트]
${ytLines.join("\n")}

[뉴스 임팩트 TOP10]
${newsLines.join("\n")}`;
}

export async function POST(req: NextRequest) {
  const { message, history = [] } = await req.json();

  const context = await buildContext();

  const systemPrompt = `당신은 한국 주식 AI 대시보드의 투자 어시스턴트입니다.
아래 실시간 데이터를 기반으로 사용자 질문에 답변하세요.

규칙:
- 한국어로 답변
- 300자 이내로 간결하게
- 구체적인 종목명·가격·점수를 언급할 것
- 매수/매도 판단 근거를 데이터에서 찾을 것
- 투자 최종 결정은 사용자 본인 책임임을 한 줄로 부기

${context}`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 800,
          system: systemPrompt,
          messages: [
            ...history.map((h: { role: string; content: string }) => ({
              role: h.role as "user" | "assistant",
              content: h.content,
            })),
            { role: "user", content: message },
          ],
        });

        for await (const chunk of response) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch {
        controller.enqueue(encoder.encode("오류가 발생했습니다. 잠시 후 다시 시도해주세요."));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
