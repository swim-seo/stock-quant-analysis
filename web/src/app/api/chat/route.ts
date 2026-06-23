import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";

const MACRO_KEYWORDS = [
  "코스피", "코스닥", "시장", "급락", "급등", "떨어졌", "올랐", "왜 빠", "왜 올",
  "서킷브레이커", "사이드카", "외국인", "기관", "환율", "달러", "연준", "금리",
  "인플레", "경기", "반도체 시장", "전체", "전종목", "지수", "매크로",
];

function isMacroQuestion(message: string): boolean {
  return MACRO_KEYWORDS.some((kw) => message.includes(kw));
}

async function searchTavilyNews(query: string): Promise<string> {
  if (!TAVILY_API_KEY) return "";
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: `${query} 한국 주식 코스피`,
        search_depth: "basic",
        max_results: 6,
        include_answer: true,
        include_domains: ["reuters.com", "yna.co.kr", "mk.co.kr", "hankyung.com", "chosun.com", "news.naver.com"],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const data = await res.json();

    const lines: string[] = [];
    if (data.answer) lines.push(`요약: ${data.answer}`);
    for (const r of data.results ?? []) {
      const date = r.published_date ? r.published_date.slice(0, 10) : "날짜미상";
      lines.push(`  [${date}] ${r.title} (${r.url?.split("/")[2] ?? "출처미상"})`);
      if (r.content) lines.push(`    ${r.content.slice(0, 200)}`);
    }
    return lines.length ? `=== 실시간 웹 검색 결과 ===\n${lines.join("\n")}` : "";
  } catch {
    return "";
  }
}

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

async function buildMarketNewsContext(): Promise<string> {
  const [newsRes, ytRes] = await Promise.all([
    supabase
      .from("stock_news")
      .select("stock_name,collected_at,analysis,sentiment")
      .order("collected_at", { ascending: false })
      .limit(20),
    supabase
      .from("youtube_insights")
      .select("upload_date,channel,market_sentiment,key_stocks,investment_signals")
      .order("processed_at", { ascending: false })
      .limit(10),
  ]);

  const newsLines = (newsRes.data ?? []).map((r) => {
    const analysis: { summary?: string } = parseJson(r.analysis) ?? {};
    const summary = (analysis.summary ?? r.sentiment ?? "").slice(0, 120);
    return `  [${r.collected_at?.slice(0, 10) ?? "날짜미상"}] ${r.stock_name}: ${summary}`;
  });

  const ytLines = (ytRes.data ?? []).map((r) => {
    const sigs: string[] = Array.isArray(r.investment_signals) ? r.investment_signals.slice(0, 2) : [];
    const stocks: string[] = Array.isArray(r.key_stocks) ? r.key_stocks.slice(0, 5) : [];
    return `  [${r.upload_date}] ${r.channel} (${r.market_sentiment})${stocks.length ? ": " + stocks.join(", ") : ""}${sigs.length ? " / " + sigs.join(" | ") : ""}`;
  });

  return [
    "=== 최신 종목뉴스 (수집일순 최근 20건) ===",
    newsLines.join("\n"),
    "",
    "=== 유튜브 시장인사이트 (최근 10건) ===",
    ytLines.join("\n"),
  ].join("\n");
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

// Codex+Gemini 권고: lastTicker = 이전 대화에서 감지된 종목명, 팔로업 질문에 fallback으로 사용
async function buildStockContext(message: string, lastTicker: string | null): Promise<{ text: string; detectedName: string | null }> {
  const words = message.replace(/[^가-힣\w\s]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  // 메시지에 종목 단어 없으면 이전 종목(lastTicker) fallback
  const searchWords = words.length > 0 ? words : (lastTicker ? [lastTicker] : []);
  if (!searchWords.length) return { text: "", detectedName: null };

  const orFilter = searchWords.slice(0, 6).map((w) => `stock_name.ilike.%${w}%`).join(",");

  // trade_signals 단일 조회로 사전계산 점수 전부 획득 (Gemini 제안)
  const { data: signalStocks } = await supabase
    .from("trade_signals")
    .select("ticker,stock_name,sector,signal,composite_score,factor_score,news_score,yt_score,tech_score,key_yt_signals,urgency,market_regime,calculated_at")
    .or(orFilter)
    .order("composite_score", { ascending: false })
    .limit(2);

  // trade_signals에 없으면 factor_scores로 fallback + 뉴스/목표가는 별도 조회
  if (!signalStocks?.length) {
    const { data: factorStocks } = await supabase
      .from("factor_scores")
      .select("ticker,stock_name,composite_score,momentum_score,flow_score,value_score")
      .or(orFilter)
      .order("composite_score", { ascending: false })
      .limit(2);
    if (!factorStocks?.length) return { text: "", detectedName: null };

    const fallbackSections = await Promise.all(factorStocks.map(async (f) => {
      const [pricesRes, newsRes, targetsRes] = await Promise.all([
        supabase.from("stock_prices").select("trade_date,close_price").eq("ticker", f.ticker).order("trade_date", { ascending: false }).limit(7),
        supabase.from("stock_news").select("collected_at,articles,analysis,sentiment").ilike("stock_name", `%${f.stock_name}%`).order("collected_at", { ascending: false }).limit(1),
        supabase.from("analyst_targets").select("firm_name,target_price,upside_pct,direction,report_date").eq("stock_code", f.ticker).order("report_date", { ascending: false }).limit(5),
      ]);
      const prices = pricesRes.data ?? [];
      const pricePct = prices.length >= 2 ? ((prices[0].close_price - prices[prices.length - 1].close_price) / prices[prices.length - 1].close_price) * 100 : null;
      const priceStr = prices.length >= 2
        ? `${prices[prices.length - 1].close_price?.toLocaleString()}원→${prices[0].close_price?.toLocaleString()}원 (${pricePct! >= 0 ? "+" : ""}${pricePct?.toFixed(1)}%)`
        : "없음";
      const newsRow = newsRes.data?.[0];
      const newsAnalysis: { summary?: string } = parseJson(newsRow?.analysis) ?? {};
      const newsStr = newsAnalysis.summary ?? "없음";
      const targets = targetsRes.data ?? [];
      const targetStr = targets.length
        ? targets.map((t) => `[${t.report_date}] ${t.firm_name} ${t.target_price?.toLocaleString()}원 (${t.upside_pct && t.upside_pct > 0 ? "+" : ""}${t.upside_pct?.toFixed(1)}%) ${t.direction ?? ""}`).join(", ")
        : "없음";
      return `--- ${f.stock_name}(${f.ticker}) — 팩터만 집계됨 (매매신호 미집계) ---\n팩터: ${f.composite_score}점 | 모멘텀: ${f.momentum_score?.toFixed(1)} | 수급: ${f.flow_score?.toFixed(1)} | 가치: ${f.value_score?.toFixed(1)}\n주가: ${priceStr}\n뉴스요약: ${newsStr}\n증권사목표가: ${targetStr}`;
    }));
    return { text: fallbackSections.join("\n"), detectedName: factorStocks[0].stock_name };
  }

  const stocks = signalStocks;
  const mainSector = stocks[0]?.sector;
  const mainTickers = stocks.map((s) => s.ticker);

  const sections: string[] = [];

  for (const st of stocks) {
    // 병렬 조회: 주가추이 + 뉴스기사 + 유튜브언급 + 증권사목표가 + 같은 섹터 관련 종목
    const [pricesRes, newsRes, ytRes, targetsRes, sectorRes] = await Promise.all([
      supabase.from("stock_prices").select("trade_date,close_price").eq("ticker", st.ticker).order("trade_date", { ascending: false }).limit(10),
      supabase.from("stock_news").select("collected_at,articles,analysis,sentiment").ilike("stock_name", `%${st.stock_name}%`).order("collected_at", { ascending: false }).limit(1),
      supabase.from("youtube_insights").select("upload_date,channel,market_sentiment,investment_signals,key_stocks_sentiment").contains("key_stocks", [st.stock_name]).order("processed_at", { ascending: false }).limit(5),
      supabase.from("analyst_targets").select("firm_name,target_price,upside_pct,direction,rating,report_date").eq("stock_code", st.ticker).order("report_date", { ascending: false }).limit(5),
      // 같은 섹터 관련 종목 — 데이터 없을 때 Claude가 섹터 흐름으로 추론할 수 있도록
      mainSector ? supabase.from("trade_signals").select("stock_name,signal,composite_score,factor_score,news_score").eq("sector", mainSector).not("ticker", "in", `(${mainTickers.map((t) => `"${t}"`).join(",")})`).order("composite_score", { ascending: false }).limit(4) : Promise.resolve({ data: [] }),
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
    const { label, reason } = computeVerdict({ factorScore: st.factor_score, newsScore: st.news_score, ytScore: st.yt_score, pricePct });
    const ytSignals = Array.isArray(st.key_yt_signals) ? st.key_yt_signals.slice(0, 2).join(" / ") : (st.key_yt_signals ?? "");
    const sectorPeers = (sectorRes.data ?? []).map((p) => `${p.stock_name} ${p.signal}(${p.composite_score}점)`).join(", ");

    sections.push(`
--- ${st.stock_name}(${st.ticker}) | 섹터: ${st.sector} ---
AI판단: ${label} | 근거: ${reason}
신호: ${st.signal} | 종합: ${st.composite_score}점 | 시장: ${st.market_regime}
팩터: ${st.factor_score ?? "없음"}점 | 뉴스감성: ${st.news_score ?? "없음"}점 | 유튜브감성: ${st.yt_score ?? "없음"}점 | 기술: ${st.tech_score ?? "없음"}점${st.urgency ? ` | 긴급: ${st.urgency}` : ""}
주가: ${priceSection}
뉴스: ${newsSection}
유튜브: ${ytSection}${ytSignals ? ` / 핵심신호: ${ytSignals}` : ""}
증권사목표가: ${targetSection}
같은섹터관련종목: ${sectorPeers || "없음"}`);
  }

  return { text: sections.join("\n"), detectedName: stocks[0].stock_name };
}

export async function POST(req: NextRequest) {
  // charCode 65279 = U+FEFF (BOM) — appears when pasting API keys into Vercel env vars on Windows
  const rawKey = process.env.ANTHROPIC_API_KEY ?? "";
  const apiKey = (rawKey.charCodeAt(0) === 65279 ? rawKey.slice(1) : rawKey).trim();
  if (!apiKey) {
    console.error("[chat] ANTHROPIC_API_KEY not set");
    return new Response("서버 설정 오류", { status: 500 });
  }

  const { message, history = [], lastTicker = null } = await req.json();
  if (!message) return new Response("message required", { status: 400 });

  let context = "";
  let stockContext = "";
  let marketContext = "";
  let tavilyContext = "";
  let detectedName: string | null = null;
  try {
    const [ctx, stockResult] = await Promise.all([buildContext(), buildStockContext(message, lastTicker)]);
    context = ctx;
    stockContext = stockResult.text;
    detectedName = stockResult.detectedName;

    const needsMarketCtx = !stockResult.text || isMacroQuestion(message);
    if (needsMarketCtx) {
      [marketContext, tavilyContext] = await Promise.all([
        buildMarketNewsContext(),
        searchTavilyNews(message),
      ]);
    }
  } catch (e) {
    console.error("[chat] context error:", e);
  }

  const systemPrompt = `당신은 주식 투자 경험이 풍부한 현명한 친구입니다. 아래 데이터를 기반으로 자유롭게, 진짜 대화처럼 얘기해주세요.

**대화 방식**
- 보고서 섹션 형식 금지. 자연스러운 문장으로
- 짧은 질문엔 짧게, 분석 요청엔 길게 — 상황 보고 판단
- 수치는 반드시 구체적으로: "약세"가 아니라 "팩터 38점으로 40 미만 약세구간"
- 날짜·출처 포함: "KB증권이 6월 15일에 목표가 280,000원으로 하향" 이런 식으로
- 마지막엔 짧게 "⚠️ 최종 결정은 본인 판단 하에."

**시장 전반 질문 대처 (급락/급등/왜 떨어졌어 등)**
- "최신 종목뉴스" 섹션에 오늘 수집된 뉴스가 있으면 → 거기서 공통 원인을 찾아 설명
  예: "오늘 수집된 뉴스 보면 반도체 섹터 전반에 미국 수출규제 뉴스가 떴고, 삼성·SK하이닉스 모두 악재로 분류됐어요. 이게 시장 전체를 끌어내린 것 같아요."
- 뉴스가 오늘 날짜가 아니면 솔직하게 "지금 제가 가진 최신 뉴스는 XX일 기준이라서..." 라고 말하기
- 유튜브 인사이트에 시장 심리(bearish/bullish)가 있으면 함께 언급

**데이터 없을 때 대처**
- 특정 종목 데이터가 없으면 → 같은 섹터 관련종목 데이터를 보고 섹터 흐름으로 추론해서 말하기
  예: "현대차 직접 데이터는 없는데, 같은 자동차 섹터 기아가 BUY 75점이고 현대모비스가 HOLD 58점인 걸 보면 섹터 전반은 괜찮은 편이에요. 현대차도..."
- 추론할 때는 "추정컨대", "섹터 흐름으로 보면" 같이 불확실성 표시

**모르는 정보는 물어보기**
- 분석에 필요한데 모르면 자연스럽게 물어봐
  예: "언제 매수하셨어요?", "평균단가가 얼마예요?", "단기 트레이딩이에요 아니면 장기 투자예요?"
- 한 번에 너무 많이 물어보지 말고 가장 중요한 것 하나만

**관련 종목 함께 언급**
- 종목 분석할 때 같은 섹터 관련종목이 있으면 자연스럽게 비교해주기
  예: "현대차랑 같은 자동차 섹터에서 기아는 지금 BUY 신호고 현대모비스는 HOLD인데, 비교해보면..."

${context}${stockContext ? `\n\n${stockContext}` : ""}${marketContext ? `\n\n${marketContext}` : ""}${tavilyContext ? `\n\n${tavilyContext}` : ""}`;

  const anthropic = new Anthropic({ apiKey });
  const encoder   = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const stream = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 3000, stream: true,
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

  // X-Detected-Ticker: 클라이언트가 lastTicker로 저장해 팔로업 질문에 재사용
  const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
  if (detectedName) headers["X-Detected-Ticker"] = encodeURIComponent(detectedName);
  return new Response(readableStream, { headers });
}
