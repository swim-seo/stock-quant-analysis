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

// Codex 합성 알고리즘: S = 0.5×팩터 + 0.3×(뉴스0.6+유튜브0.4) + 0.2×가격
function computeVerdict(p: { factorScore: number | null; newsScore: number | null; ytScore: number | null; pricePct: number | null }) {
  const fs = p.factorScore ?? 50;
  const ns = p.newsScore  ?? 50;
  const ys = p.ytScore    ?? 50;
  const pp = p.pricePct   ?? 0;

  const nF = (fs - 50) / 50;
  const nN = (ns - 50) / 50;
  const nY = (ys - 50) / 50;
  const nP = Math.max(-1, Math.min(1, pp / 10));
  const cm = 0.6 * nN + 0.4 * nY;
  const S  = 0.5 * nF + 0.3 * cm + 0.2 * nP;

  if (fs < 40 && pp < -8 && cm < -0.3)
    return { S, label: "⛔ STRONG CUT", reason: `팩터약세(${fs}점) + 주가${pp.toFixed(1)}% + 미디어부정` };
  if (fs > 70 && pp > 6 && cm > 0.4)
    return { S, label: "🚀 STRONG BUY", reason: `팩터강세(${fs}점) + 주가+${pp.toFixed(1)}% + 미디어긍정` };

  const spread = Math.max(nF, cm, nP) - Math.min(nF, cm, nP);
  if (spread > 0.6 && Math.abs(S) < 0.15)
    return { S, label: "⚠️ CONFLICT", reason: `신호 충돌 — 팩터${nF.toFixed(2)} vs 미디어${cm.toFixed(2)} vs 가격${nP.toFixed(2)}` };

  const label =
    S >= 0.40  ? "🟢 BUY" :
    S <= -0.40 ? "🔴 SELL" :
    Math.abs(S) < 0.15 ? "⚪ HOLD" :
    S > 0 ? "🟡 LIGHT BUY (소량 매수)" : "🟠 LIGHT SELL (비중 축소)";

  return { S, label, reason: `S=${S.toFixed(2)} | 팩터${nF.toFixed(2)}×0.5 + 미디어${cm.toFixed(2)}×0.3 + 가격${nP.toFixed(2)}×0.2` };
}

function parseJson<T>(val: unknown): T | null {
  if (!val) return null;
  if (typeof val === "object") return val as T;
  try { return JSON.parse(val as string) as T; } catch { return null; }
}

async function buildContext(): Promise<string> {
  const [signalsRes, ytRes, newsRes] = await Promise.all([
    supabase.from("trade_signals").select("ticker,stock_name,sector,signal,composite_score,market_regime,calculated_at").order("composite_score", { ascending: false }).limit(50),
    supabase.from("youtube_insights").select("upload_date,channel,key_stocks,investment_signals,market_sentiment").order("processed_at", { ascending: false }).limit(6),
    supabase.from("stock_news").select("stock_name,sentiment,trading_signal,news_impact_score").order("news_impact_score", { ascending: false }).limit(15),
  ]);

  const signals = signalsRes.data ?? [];
  const buys  = signals.filter((s) => s.signal === "BUY");
  const holds = signals.filter((s) => s.signal === "HOLD");
  const sells = signals.filter((s) => s.signal === "SELL");
  const regime = signals[0]?.market_regime ?? "NEUTRAL";
  const calcAt = signals[0]?.calculated_at
    ? new Date(signals[0].calculated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "미확인";

  const ytLines = (ytRes.data ?? []).map((y) => {
    const ks: string[] = y.key_stocks ?? [];
    const sig: string[] = Array.isArray(y.investment_signals) ? y.investment_signals : [];
    return `- [${y.upload_date}] ${y.channel}: ${ks.slice(0, 5).join(", ")} / ${y.market_sentiment} / ${sig.slice(0, 2).join(" | ")}`;
  });

  return `[시스템 데이터 — ${calcAt} / 시장국면: ${regime}]
BUY ${buys.length}개: ${buys.map((b) => `${b.stock_name}(${b.composite_score}점)`).join(", ")}
HOLD 상위: ${holds.slice(0, 8).map((s) => `${s.stock_name}(${s.composite_score}점)`).join(", ")}
SELL: ${sells.slice(0, 5).map((s) => `${s.stock_name}(${s.composite_score}점)`).join(", ")}
뉴스 임팩트: ${(newsRes.data ?? []).map((n) => `${n.stock_name}(${n.sentiment}/${n.news_impact_score}점)`).join(", ")}
YouTube: ${ytLines.join(" | ")}`;
}

async function buildStockContext(message: string): Promise<string> {
  const words = message.replace(/[^가-힣\w\s]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  if (!words.length) return "";

  const orFilter = words.slice(0, 6).map((w) => `stock_name.ilike.%${w}%`).join(",");

  // trade_signals 단일 조회로 사전계산 점수 전부 획득 (Gemini 제안)
  const { data: stocks } = await supabase
    .from("trade_signals")
    .select("ticker,stock_name,sector,signal,composite_score,factor_score,news_score,yt_score,tech_score,key_yt_signals,urgency,market_regime,calculated_at")
    .or(orFilter)
    .order("composite_score", { ascending: false })
    .limit(2);

  if (!stocks?.length) return "";

  const sections: string[] = [];

  for (const st of stocks) {
    // 병렬 조회: 주가추이 + 뉴스기사 + 유튜브언급 + 증권사목표가
    const [pricesRes, newsRes, ytRes, targetsRes] = await Promise.all([
      supabase.from("stock_prices").select("trade_date,close_price").eq("ticker", st.ticker).order("trade_date", { ascending: false }).limit(10),
      supabase.from("stock_news").select("collected_at,articles,analysis,sentiment").ilike("stock_name", `%${st.stock_name}%`).order("collected_at", { ascending: false }).limit(1),
      supabase.from("youtube_insights").select("upload_date,channel,market_sentiment,investment_signals,key_stocks_sentiment").contains("key_stocks", [st.stock_name]).order("processed_at", { ascending: false }).limit(5),
      supabase.from("analyst_targets").select("firm_name,target_price,upside_pct,direction,rating,report_date").eq("stock_code", st.ticker).order("report_date", { ascending: false }).limit(5),
    ]);

    // 가격 추이
    const prices  = pricesRes.data ?? [];
    const pricePct = prices.length >= 2
      ? ((prices[0].close_price - prices[prices.length - 1].close_price) / prices[prices.length - 1].close_price) * 100
      : null;
    const priceSection = prices.length >= 2
      ? `${prices.length}일 추이: ${prices[prices.length - 1].close_price?.toLocaleString()}원 → ${prices[0].close_price?.toLocaleString()}원 (${pricePct! >= 0 ? "+" : ""}${pricePct?.toFixed(1)}%)\n` +
        prices.map((p) => `  ${p.trade_date}: ${p.close_price?.toLocaleString()}원`).join("\n")
      : prices.length === 1 ? `현재가: ${prices[0].close_price?.toLocaleString()}원` : "주가 데이터 없음";

    // 뉴스 기사 (날짜·출처·제목 포함)
    const newsRow     = newsRes.data?.[0];
    const newsArticles: Array<{ date?: string; title?: string; source?: string }> = parseJson(newsRow?.articles) ?? [];
    const newsAnalysis: { summary?: string; key_points?: string[] } = parseJson(newsRow?.analysis) ?? {};
    const collectedAt = newsRow?.collected_at ? new Date(newsRow.collected_at).toLocaleDateString("ko-KR") : null;
    const newsSection = newsArticles.length
      ? `수집일: ${collectedAt ?? "미확인"}\n요약: ${newsAnalysis.summary ?? "없음"}\n기사:\n` +
        newsArticles.slice(0, 5).map((a) => `  [${a.date ?? "날짜미상"}] (${a.source ?? "출처미상"}) ${a.title ?? ""}`).join("\n")
      : "뉴스 없음";

    // 유튜브 언급 (날짜·채널 포함)
    const ytItems = ytRes.data ?? [];
    const ytSection = ytItems.length
      ? ytItems.map((y) => {
          const sigs: string[] = Array.isArray(y.investment_signals) ? y.investment_signals : [];
          return `  [${y.upload_date}] ${y.channel} — ${y.market_sentiment}${sigs.length ? " / " + sigs[0] : ""}`;
        }).join("\n")
      : "유튜브 언급 없음";

    // 증권사 목표가 (회사명·날짜·상승여력 포함)
    const targets = targetsRes.data ?? [];
    const targetSection = targets.length
      ? targets.map((t) => `  [${t.report_date}] ${t.firm_name}: ${t.target_price?.toLocaleString()}원 (${t.upside_pct && t.upside_pct > 0 ? "+" : ""}${t.upside_pct?.toFixed(1)}%) — ${t.direction ?? ""}`).join("\n")
      : "증권사 목표가 없음";

    // Codex 종합판단
    const { label, reason, S } = computeVerdict({ factorScore: st.factor_score, newsScore: st.news_score, ytScore: st.yt_score, pricePct });
    const ytSignals = Array.isArray(st.key_yt_signals) ? st.key_yt_signals.slice(0, 2).join(" / ") : (st.key_yt_signals ?? "-");

    sections.push(`
━━━ ${st.stock_name}(${st.ticker}) | ${st.sector} ━━━

[AI 종합판단]
${label} — ${reason}
시스템신호: ${st.signal} | 종합점수: ${st.composite_score} | 시장국면: ${st.market_regime}

[팩터 점수] (65+강세 / 40미만약세)
팩터: ${st.factor_score ?? "-"} | 뉴스: ${st.news_score ?? "-"} | 유튜브: ${st.yt_score ?? "-"} | 기술: ${st.tech_score ?? "-"}${st.urgency ? ` | 긴급도: ${st.urgency}` : ""}

[주가 추이]
${priceSection}

[최근 뉴스]
${newsSection}

[유튜브 언급]
${ytSection}
유튜브 핵심신호: ${ytSignals}

[증권사 목표가]
${targetSection}`);
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

[종목 분석 시 출력 형식 — 반드시 이 순서로 섹션을 나눠서 답변]
## 📊 AI 종합판단
(AI 종합판단 내용 — label과 근거 설명)

## 📈 팩터 분석
(팩터·뉴스·유튜브·기술 점수 해석. 65+강세/40미만약세)

## 📰 최근 뉴스
(기사별 날짜·출처·제목 포함. 요약도 함께)

## 📺 유튜브 언급
(채널·날짜·언급 내용 포함)

## 🎯 증권사 목표가
(회사명·목표가·상승여력·날짜 포함. 없으면 "데이터 없음")

## 💹 주가 추이
(날짜별 종가 나열 + 낙폭 설명)

[응답 원칙]
- 한국어 답변
- 종목 분석: 위 섹션 형식 필수. 각 섹션 데이터 없으면 "데이터 없음" 표기
- 일반 시장 질문: 400자 이내 자유 형식
- 데이터에 있는 날짜·출처·수치는 반드시 직접 언급 (신빙성을 위해)
- CONFLICT 판단이면 신호 충돌 이유를 설명하고 추가 확인 포인트 제안
- 마지막 줄: "⚠️ 최종 투자 결정은 본인 판단과 책임 하에 진행하세요."

${context}${stockContext ? `\n${stockContext}` : ""}`;

  const anthropic = new Anthropic({ apiKey });
  const encoder   = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const stream = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 2000, stream: true,
          system: systemPrompt,
          messages: [
            ...history.map((h: { role: string; content: string }) => ({ role: h.role as "user" | "assistant", content: h.content })),
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

  return new Response(readableStream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
