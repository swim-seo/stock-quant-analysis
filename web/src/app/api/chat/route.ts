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

// Codex 합성 알고리즘: S = 0.5×팩터 + 0.3×미디어감성 + 0.2×가격추세
function computeVerdict(params: {
  factorScore: number | null;
  newsScore: number | null;
  ytScore: number | null;
  pricePct: number | null;
}): { verdict: string; S: number; detail: string } {
  const fs = params.factorScore ?? 50;
  const ns = params.newsScore ?? 50;
  const ys = params.ytScore ?? 50;
  const pp = params.pricePct ?? 0;

  const nFactor  = (fs - 50) / 50;
  const nNews    = (ns - 50) / 50;
  const nYt      = (ys - 50) / 50;
  const nPrice   = Math.max(-1, Math.min(1, pp / 10));
  const content  = 0.6 * nNews + 0.4 * nYt;
  const S        = 0.5 * nFactor + 0.3 * content + 0.2 * nPrice;

  // 하드 오버라이드
  if (fs < 40 && pp < -8 && content < -0.3)
    return { S, verdict: "⛔ STRONG CUT (즉시 손절 고려)", detail: `팩터약세(${fs}점) + 주가${pp.toFixed(1)}% + 미디어부정` };
  if (fs > 70 && pp > 6 && content > 0.4)
    return { S, verdict: "🚀 STRONG BUY (적극 매수)", detail: `팩터강세(${fs}점) + 주가+${pp.toFixed(1)}% + 미디어긍정` };

  // 신호 충돌 감지
  const vals = [nFactor, content, nPrice];
  const conflict = Math.max(...vals) - Math.min(...vals) > 0.6 && Math.abs(S) < 0.15;
  if (conflict)
    return { S, verdict: "⚠️ CONFLICT — 신호 충돌 (전문가 판단 권장)", detail: `팩터${nFactor.toFixed(2)} vs 미디어${content.toFixed(2)} vs 가격${nPrice.toFixed(2)}` };

  const label =
    S >= 0.40  ? "🟢 BUY" :
    S <= -0.40 ? "🔴 SELL" :
    Math.abs(S) < 0.15 ? "⚪ HOLD" :
    S > 0 ? "🟡 LIGHT BUY (소량 매수)" :
    "🟠 LIGHT SELL (비중 축소)";

  return { S, verdict: label, detail: `S=${S.toFixed(2)} | 팩터×0.5(${nFactor.toFixed(2)}) + 미디어×0.3(${content.toFixed(2)}) + 가격×0.2(${nPrice.toFixed(2)})` };
}

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

  const signals  = signalsRes.data ?? [];
  const buys     = signals.filter((s) => s.signal === "BUY");
  const holds    = signals.filter((s) => s.signal === "HOLD");
  const sells    = signals.filter((s) => s.signal === "SELL");
  const regime   = signals[0]?.market_regime ?? "NEUTRAL";
  const calcAt   = signals[0]?.calculated_at
    ? new Date(signals[0].calculated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "미확인";

  const ytLines  = (ytRes.data ?? []).map((y) => {
    const ks: string[] = y.key_stocks ?? [];
    const sig: string[] = Array.isArray(y.investment_signals) ? y.investment_signals : [];
    return `- [${y.upload_date}] ${y.channel}: ${ks.slice(0, 5).join(", ")} / 감성:${y.market_sentiment} / ${sig.slice(0, 2).join(" | ")}`;
  });

  const newsLines = (newsRes.data ?? []).map(
    (n) => `- ${n.stock_name}: ${n.sentiment} | ${n.trading_signal} | ${n.news_impact_score}점`
  );

  return `[시스템 데이터 — ${calcAt} 기준 / 시장국면: ${regime}]

[BUY ${buys.length}개]
${buys.map((b) => `- ${b.stock_name}(${b.ticker}) | ${b.sector} | ${b.composite_score}점`).join("\n")}

[HOLD 상위 10]
${holds.slice(0, 10).map((s) => `- ${s.stock_name} | ${s.composite_score}점`).join("\n")}

[SELL]
${sells.slice(0, 5).map((s) => `- ${s.stock_name} | ${s.composite_score}점`).join("\n")}

[YouTube 최신]
${ytLines.join("\n")}

[뉴스 TOP15]
${newsLines.join("\n")}`;
}

// Gemini 제안: trade_signals의 사전계산 점수 활용 + stock_prices만 추가 조회
async function buildStockContext(message: string): Promise<string> {
  const words = message
    .replace(/[^가-힣\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  if (!words.length) return "";

  const orFilter = words.slice(0, 6).map((w) => `stock_name.ilike.%${w}%`).join(",");

  // trade_signals에서 사전계산된 모든 점수 한 번에 조회
  const { data: stocks } = await supabase
    .from("trade_signals")
    .select("ticker,stock_name,sector,signal,composite_score,factor_score,news_score,yt_score,tech_score,key_yt_signals,yt_sentiment_ratio,urgency,market_regime,calculated_at")
    .or(orFilter)
    .order("composite_score", { ascending: false })
    .limit(3);

  if (!stocks?.length) return "";

  const sections: string[] = [];

  for (const s of stocks) {
    // 주가 추이만 별도 조회 (trade_signals에 없는 유일한 데이터)
    const { data: prices } = await supabase
      .from("stock_prices")
      .select("trade_date,close_price")
      .eq("ticker", s.ticker)
      .order("trade_date", { ascending: false })
      .limit(7);

    const priceRows   = (prices ?? []).map((p) => `  ${p.trade_date}: ${p.close_price?.toLocaleString()}원`).join("\n");
    const pricePct    = prices && prices.length >= 2
      ? ((prices[0].close_price - prices[prices.length - 1].close_price) / prices[prices.length - 1].close_price) * 100
      : null;
    const priceTrend  = prices && prices.length >= 2
      ? (() => {
          const sign = (pricePct ?? 0) >= 0 ? "+" : "";
          return `${prices.length}일간 ${prices[prices.length - 1].close_price?.toLocaleString()}원 → ${prices[0].close_price?.toLocaleString()}원 (${sign}${pricePct?.toFixed(1)}%)`;
        })()
      : prices?.length === 1 ? `현재가 ${prices[0].close_price?.toLocaleString()}원` : "주가 데이터 없음";

    // Codex 합성 알고리즘으로 최종 판단 계산
    const { verdict, S, detail } = computeVerdict({
      factorScore: s.factor_score,
      newsScore:   s.news_score,
      ytScore:     s.yt_score,
      pricePct,
    });

    const ytSignals = Array.isArray(s.key_yt_signals) ? s.key_yt_signals.slice(0, 2).join(" / ") : (s.key_yt_signals ?? "없음");

    sections.push(
      `\n[${s.stock_name}(${s.ticker}) 종목 분석]
▶ AI 종합판단: ${verdict}
  근거: ${detail}
신호: ${s.signal} | 종합점수: ${s.composite_score} | 시장국면: ${s.market_regime}
세부점수 — 팩터:${s.factor_score ?? "-"} | 뉴스:${s.news_score ?? "-"} | 유튜브:${s.yt_score ?? "-"} | 기술:${s.tech_score ?? "-"}
주가추이: ${priceTrend}
${priceRows ? `일별 종가:\n${priceRows}` : ""}
유튜브 핵심신호: ${ytSignals}${s.urgency ? ` | 긴급도: ${s.urgency}` : ""}`
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
  if (!message) return new Response("message required", { status: 400 });

  let context = "";
  let stockContext = "";
  try {
    [context, stockContext] = await Promise.all([buildContext(), buildStockContext(message)]);
  } catch (e) {
    console.error("[chat] context error:", e);
  }

  const systemPrompt = `당신은 한국 주식 AI 대시보드의 투자 어시스턴트입니다.

[응답 원칙]
- 한국어 답변. 일반 질문 400자 / 종목 분석 700자 이내
- 종목 분석 시: 'AI 종합판단' 결과를 먼저 제시하고, 판단 근거(팩터·가격추이·미디어 세부점수)를 구체적 수치로 설명
- 세부점수 해석: 팩터(65+강세/40미만약세) | 뉴스(65+긍정/40미만부정) | 유튜브(65+긍정/40미만부정) | 기술(50+상승추세)
- 주가 하락 시: 낙폭과 세 가지 점수를 종합해 추가 하락 리스크 vs 반등 여력을 수치로 제시
- CONFLICT 판단이면: 신호가 엇갈리는 이유를 설명하고 추가 확인 포인트 제안
- 마지막 줄: "⚠️ 최종 투자 결정은 본인 판단과 책임 하에 진행하세요."

${context}${stockContext ? `\n${stockContext}` : ""}`;

  const anthropic = new Anthropic({ apiKey });
  const encoder   = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const stream = await anthropic.messages.create({
          model:      "claude-sonnet-4-6",
          max_tokens: 1500,
          stream:     true,
          system:     systemPrompt,
          messages: [
            ...history.map((h: { role: string; content: string }) => ({
              role: h.role as "user" | "assistant",
              content: h.content,
            })),
            { role: "user", content: message },
          ],
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
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
