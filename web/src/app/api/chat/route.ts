import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const STOP_WORDS = new Set([
  "지금", "오늘", "어때", "어떻게", "하지", "사면", "팔면", "봐줘", "알려줘",
  "뭐야", "맞아", "있어", "없어", "왜요", "근데", "그리고", "그래서", "이거",
  "저거", "그거", "나는", "내가", "주식", "종목", "투자", "분석", "추천",
  "매수", "매도", "신호", "점수", "시장", "상황", "현재", "최근", "어디",
  "뭔가", "뭐지", "좋아", "나쁘", "비싸", "싸다", "올라", "내려", "했어",
  "했는", "인데", "것은", "것이", "하면", "하고", "해줘", "해봐",
]);

async function buildContext(): Promise<string> {
  const [signalsRes, ytRes, newsRes] = await Promise.all([
    supabase
      .from("trade_signals")
      .select("ticker,stock_name,sector,signal,composite_score,market_regime,calculated_at")
      .order("composite_score", { ascending: false })
      .limit(50),
    supabase
      .from("youtube_insights")
      .select("upload_date,channel,key_stocks,investment_signals,market_sentiment")
      .order("processed_at", { ascending: false })
      .limit(6),
    supabase
      .from("stock_news")
      .select("stock_name,sentiment,trading_signal,news_impact_score")
      .order("news_impact_score", { ascending: false })
      .limit(15),
  ]);

  const signals = signalsRes.data ?? [];
  const buys = signals.filter((s) => s.signal === "BUY");
  const holds = signals.filter((s) => s.signal === "HOLD");
  const sells = signals.filter((s) => s.signal === "SELL");
  const regime = signals[0]?.market_regime ?? "NEUTRAL";
  const calcAt = signals[0]?.calculated_at
    ? new Date(signals[0].calculated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "미확인";

  const ytLines = (ytRes.data ?? []).map((y) => {
    const ks: string[] = y.key_stocks ?? [];
    const sig: string[] = Array.isArray(y.investment_signals) ? y.investment_signals : [];
    return `- [${y.upload_date}] ${y.channel}: 언급종목 ${ks.slice(0, 5).join(", ")} / 감성: ${y.market_sentiment}\n  신호: ${sig.slice(0, 2).join(" | ")}`;
  });

  const newsLines = (newsRes.data ?? []).map(
    (n) => `- ${n.stock_name}: ${n.sentiment} | ${n.trading_signal} | ${n.news_impact_score}점`
  );

  return `[현재 시스템 데이터 — ${calcAt} 기준]
시장국면: ${regime}

[BUY 신호 ${buys.length}개]
${buys.map((b) => `- ${b.stock_name}(${b.ticker}) | ${b.sector} | 점수:${b.composite_score}`).join("\n")}

[HOLD 상위 10개]
${holds.slice(0, 10).map((s) => `- ${s.stock_name}: HOLD | 점수:${s.composite_score}`).join("\n")}

[SELL 종목]
${sells.slice(0, 5).map((s) => `- ${s.stock_name}: SELL | 점수:${s.composite_score}`).join("\n")}

[YouTube 최신 인사이트]
${ytLines.join("\n")}

[뉴스 임팩트 TOP15]
${newsLines.join("\n")}`;
}

async function buildStockContext(message: string): Promise<string> {
  const words = message
    .replace(/[^가-힣\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  if (!words.length) return "";

  const orFilter = words
    .slice(0, 6)
    .map((w) => `stock_name.ilike.%${w}%`)
    .join(",");

  const { data: factors } = await supabase
    .from("factor_scores")
    .select("ticker,stock_name,composite_score,momentum_score,flow_score,value_score,close_price,calculated_at")
    .or(orFilter)
    .limit(3);

  if (!factors?.length) return "";

  const sections: string[] = [];

  for (const f of factors) {
    const [sigRes, pricesRes, newsRes] = await Promise.all([
      supabase
        .from("trade_signals")
        .select("signal,composite_score,market_regime")
        .eq("ticker", f.ticker)
        .limit(1),
      supabase
        .from("stock_prices")
        .select("trade_date,close_price,volume")
        .eq("ticker", f.ticker)
        .order("trade_date", { ascending: false })
        .limit(7),
      supabase
        .from("stock_news")
        .select("sentiment,trading_signal,news_impact_score,summary")
        .ilike("stock_name", `%${f.stock_name}%`)
        .order("news_impact_score", { ascending: false })
        .limit(3),
    ]);

    const sig = sigRes.data?.[0];
    const prices = pricesRes.data ?? [];
    const newsItems = newsRes.data ?? [];

    const priceTrend =
      prices.length >= 2
        ? (() => {
            const latest = prices[0].close_price;
            const oldest = prices[prices.length - 1].close_price;
            const pct = (((latest - oldest) / oldest) * 100).toFixed(1);
            const sign = Number(pct) >= 0 ? "+" : "";
            return `${prices.length}일간 ${oldest?.toLocaleString()}원→${latest?.toLocaleString()}원 (${sign}${pct}%)`;
          })()
        : prices.length === 1
        ? `현재가 ${prices[0].close_price?.toLocaleString()}원`
        : "주가 데이터 없음";

    const priceRows = prices
      .map((p) => `  ${p.trade_date}: ${p.close_price?.toLocaleString()}원`)
      .join("\n");

    const newsText = newsItems.length
      ? newsItems.map((n) => `${n.sentiment}/${n.trading_signal}(${n.news_impact_score}점)${n.summary ? ` — ${n.summary.slice(0, 40)}` : ""}`).join("\n  ")
      : "없음";

    // YouTube mentions for this stock
    const { data: ytData } = await supabase
      .from("youtube_insights")
      .select("upload_date,channel,market_sentiment,investment_signals")
      .contains("key_stocks", [f.stock_name])
      .order("processed_at", { ascending: false })
      .limit(3);

    const ytText = ytData?.length
      ? ytData.map((y) => {
          const sigs: string[] = Array.isArray(y.investment_signals) ? y.investment_signals : [];
          return `[${y.upload_date}] ${y.channel} — ${y.market_sentiment}${sigs.length ? ` / ${sigs[0]}` : ""}`;
        }).join("\n  ")
      : "없음";

    sections.push(
      `\n[${f.stock_name}(${f.ticker}) 종목 상세분석]
매매신호: ${sig?.signal ?? "미집계"} | 종합점수: ${f.composite_score ?? sig?.composite_score ?? "-"}
팩터 — 모멘텀:${f.momentum_score?.toFixed(1) ?? "-"} | 수급:${f.flow_score?.toFixed(1) ?? "-"} | 가치:${f.value_score?.toFixed(1) ?? "-"}
주가추이: ${priceTrend}
${priceRows ? `일별 종가:\n${priceRows}` : ""}
뉴스: ${newsText}
유튜브 언급: ${ytText}`
    );
  }

  return sections.join("\n");
}

export async function POST(req: NextRequest) {
  // charCode 65279 = U+FEFF (BOM) — appears when pasting API keys into Vercel env vars on Windows
  const rawKey = process.env.ANTHROPIC_API_KEY ?? "";
  const apiKey = (rawKey.charCodeAt(0) === 65279 ? rawKey.slice(1) : rawKey).trim();
  if (!apiKey) {
    console.error("[chat] ANTHROPIC_API_KEY not set");
    return new Response("서버 설정 오류", { status: 500 });
  }

  const { message, history = [] } = await req.json();
  if (!message) {
    return new Response("message required", { status: 400 });
  }

  let context = "";
  let stockContext = "";
  try {
    [context, stockContext] = await Promise.all([
      buildContext(),
      buildStockContext(message),
    ]);
  } catch (e) {
    console.error("[chat] context error:", e);
  }

  const systemPrompt = `당신은 한국 주식 AI 대시보드의 투자 어시스턴트입니다.
아래 실시간 데이터(매매신호·주가추이·뉴스·유튜브)를 기반으로 구체적인 투자 판단을 제공하세요.

[응답 원칙]
- 한국어 답변
- 일반 질문: 400자 이내 / 특정 종목 분석: 700자 이내
- 데이터 근거 필수 — 점수·가격·날짜를 직접 언급
- 종목 상세 데이터가 있으면: 주가추이·팩터·신호·뉴스·유튜브를 종합해 손절/홀딩/추가매수 판단 근거를 구체적 수치로 제시
- 팩터 해석: 모멘텀 양수=상승추세, 수급 양수=기관·외국인 순매수 강세, 가치 양수=저평가
- 종합점수 기준: 65+ BUY / 40-65 HOLD / 40미만 SELL
- 주가 하락 시: 낙폭·팩터·뉴스 감성·유튜브 언급을 종합해 "추가 하락 리스크 vs 반등 여력" 판단
- 뉴스·유튜브 데이터가 없으면 "관련 데이터 없음"으로만 표기하고 나머지 데이터로 분석
- 마지막 줄: "⚠️ 최종 투자 결정은 본인 판단과 책임 하에 진행하세요."

${context}${stockContext ? `\n${stockContext}` : ""}`;

  const anthropic = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const stream = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          stream: true,
          system: systemPrompt,
          messages: [
            ...history.map((h: { role: string; content: string }) => ({
              role: h.role as "user" | "assistant",
              content: h.content,
            })),
            { role: "user", content: message },
          ],
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const e = err as Error & { status?: number };
        console.error(`[chat-err] status=${e?.status} | ${e?.message}`);
        controller.enqueue(encoder.encode("오류가 발생했습니다. 잠시 후 다시 시도해주세요."));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
