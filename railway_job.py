"""
Railway 통합 수집기
- morning: 뉴스 수집 → 유튜브 오전 수집 → 아침 브리핑 생성
- afternoon: 뉴스+수급 수집 → 유튜브 오후 수집 → 저녁 브리핑 생성

사용법:
  python railway_job.py morning
  python railway_job.py afternoon
  python railway_job.py all  (전체 실행)
"""
import os
import sys
import json
import re
import time
import urllib.request
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv
from news_collector import analyze_news_batch, BATCH_SIZE
from kis_fetcher import get_client as get_kis_client

load_dotenv(Path(__file__).parent / ".env")

KST = timezone(timedelta(hours=9))

_DATE_OVERRIDE: "date | None" = None  # --date 인자로 설정

def today_kst() -> date:
    return _DATE_OVERRIDE if _DATE_OVERRIDE else datetime.now(KST).date()

def now_kst() -> datetime:
    return datetime.now(KST)

# Railway 환경변수
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=SB_HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def sb_post(table, data, on_conflict=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    headers = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        urllib.request.urlopen(req)
    except urllib.error.HTTPError as e:
        print(f"  [sb_post ERROR] {table} {e.code}: {e.read().decode('utf-8')}")
        raise


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 1: 뉴스 수집
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WATCH_STOCKS = {
    # 반도체
    "삼성전자": "005930", "SK하이닉스": "000660", "한미반도체": "042700",
    "리노공업": "058470", "DB하이텍": "000990",
    # 2차전지/에너지
    "LG에너지솔루션": "373220", "삼성SDI": "006400", "에코프로비엠": "247540",
    # 바이오
    "삼성바이오로직스": "207940", "셀트리온": "068270",
    "유한양행": "000100", "HLB": "028300",
    # 자동차
    "현대차": "005380", "기아": "000270",
    # IT/플랫폼
    "NAVER": "035420", "카카오": "035720",
    "카카오뱅크": "323410", "크래프톤": "259960",
    # 금융
    "KB금융": "105560", "신한지주": "055550", "메리츠금융지주": "138040",
    # 소재/산업재
    "LG전자": "066570", "삼성물산": "028260",
    "아모레퍼시픽": "090430", "CJ제일제당": "097950",
    # 조선
    "HD한국조선해양": "009540", "삼성중공업": "010140", "현대미포조선": "010620",
    # 방산
    "한화에어로스페이스": "012450", "LIG넥스원": "079550",
    # 원자력
    "두산에너빌리티": "034020",
    # 건설
    "현대건설": "000720",
    # 우주항공
    "인텔리안테크": "189300",
    # 로봇
    "HD현대": "267250", "레인보우로보틱스": "277810", "로보스타": "090360",
    "두산로보틱스": "454910", "에스에프에이": "056190", "로보티즈": "108490",
    "휴림로봇": "090710",
}

SECTOR_MAP = {
    "삼성전자": "반도체", "SK하이닉스": "반도체", "한미반도체": "반도체",
    "리노공업": "반도체", "DB하이텍": "반도체",
    "LG에너지솔루션": "2차전지", "삼성SDI": "2차전지", "에코프로비엠": "2차전지",
    "삼성바이오로직스": "바이오", "셀트리온": "바이오", "유한양행": "바이오", "HLB": "바이오",
    "현대차": "자동차", "기아": "자동차",
    "NAVER": "IT플랫폼", "카카오": "IT플랫폼", "카카오뱅크": "IT플랫폼", "크래프톤": "IT플랫폼",
    "KB금융": "금융", "신한지주": "금융", "메리츠금융지주": "금융",
    "LG전자": "산업재", "삼성물산": "산업재", "아모레퍼시픽": "산업재", "CJ제일제당": "산업재",
    "HD한국조선해양": "조선", "삼성중공업": "조선", "현대미포조선": "조선",
    "한화에어로스페이스": "방산", "LIG넥스원": "방산",
    "두산에너빌리티": "원자력",
    "현대건설": "건설",
    "인텔리안테크": "우주항공",
    "HD현대": "로봇", "레인보우로보틱스": "로봇", "로보스타": "로봇",
    "두산로보틱스": "로봇", "에스에프에이": "로봇", "로보티즈": "로봇",
    "휴림로봇": "로봇",
}


def fetch_naver_news(stock_code, max_pages=2):
    """네이버 모바일 API로 뉴스 수집"""
    articles = []
    headers = {"User-Agent": "Mozilla/5.0"}
    for page in range(1, max_pages + 1):
        url = f"https://m.stock.naver.com/api/news/stock/{stock_code}?pageSize=15&page={page}"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            clusters = data if isinstance(data, list) else [data]
            for cluster in clusters:
                for item in cluster.get("items", []):
                    dt = item.get("datetime", "")
                    date_fmt = f"{dt[:4]}.{dt[4:6]}.{dt[6:8]}" if len(dt) >= 8 else dt
                    oid = item.get("officeId", "")
                    aid = item.get("articleId", "")
                    articles.append({
                        "title": item.get("title", "").replace("&quot;", '"'),
                        "url": f"https://n.news.naver.com/mnews/article/{oid}/{aid}",
                        "date": date_fmt,
                        "source": item.get("officeName", ""),
                    })
        except Exception as e:
            print(f"  뉴스 수집 실패: {e}")
        time.sleep(0.5)
    return articles


def fetch_earnings_trend(stock_code: str) -> list:
    """네이버 모바일 API로 분기별 실적 수집 (최근 4분기)
    Returns: [{"quarter": "2025/4Q", "revenue": 123456, "op_profit": 12345, "net_profit": 9000}, ...]
    최신 순
    """
    url = f"https://m.stock.naver.com/api/stock/{stock_code}/finance/quarter"
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://m.stock.naver.com"}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return []

    results = []
    # 응답 구조: {"financeInfo": [...]} 또는 직접 리스트
    rows = data if isinstance(data, list) else data.get("financeInfo", [])
    if not isinstance(rows, list):
        return []
    for row in rows[:4]:
        def to_int(v):
            try: return int(str(v).replace(",", "").replace("-", "0") or 0)
            except: return 0
        results.append({
            "quarter": row.get("stacYm", row.get("stac_yymm", "")),
            "revenue":    to_int(row.get("thstrm", {}).get("saleAmt",   row.get("saleAmt",   0))),
            "op_profit":  to_int(row.get("thstrm", {}).get("bsopPrfi",  row.get("bsopPrfi",  0))),
            "net_profit": to_int(row.get("thstrm", {}).get("nplcInmSumAmt", row.get("nplcInmSumAmt", 0))),
        })
    return results


def fetch_short_balance(stock_code: str) -> list:
    """pykrx로 공매도 잔고 수집 (최근 5거래일).
    KRX 직접 HTTP는 Railway 해외 IP에서 400 오류 → pykrx 라이브러리 사용.
    Returns: [{"date": "2026.04.28", "balance_ratio": 1.23, "balance_qty": 12345}, ...]
    """
    try:
        from pykrx import stock as krx
        end_dt   = datetime.now(KST)
        start_dt = end_dt - timedelta(days=30)
        df = krx.get_shorting_balance_by_date(
            start_dt.strftime("%Y%m%d"),
            end_dt.strftime("%Y%m%d"),
            stock_code,
        )
        if df is None or df.empty:
            return []

        results = []
        for idx_date, row in df.tail(5).iterrows():
            date_str = idx_date.strftime("%Y.%m.%d") if hasattr(idx_date, "strftime") else str(idx_date)
            balance_qty   = float(row.get("공매도잔고",   row.get("ShortSaleBalanceQty", 0)) or 0)
            balance_ratio = float(row.get("공매도비중",   row.get("ShortSaleBalanceRatio", 0)) or 0)
            results.append({
                "date":          date_str,
                "balance_qty":   balance_qty,
                "balance_ratio": balance_ratio,
                "short_vol":     float(row.get("공매도거래량", 0) or 0),
                "short_ratio":   float(row.get("공매도거래비중", 0) or 0),
            })
        return list(reversed(results))  # 최신 순
    except ImportError:
        return []
    except Exception as e:
        print(f"  공매도 잔고 수집 실패 ({stock_code}): {e}")
        return []


def fetch_investor_trading(stock_code: str, days: int = 10) -> list:
    """KIS API로 외국인/기관 순매수 수집.
    Returns: [{"date": "2026.06.01", "close": 75000,
               "foreign_net": 12345, "institution_net": -6789}, ...]
    """
    try:
        return get_kis_client().fetch_investor_trading(stock_code, days=days)
    except Exception as e:
        print(f"  KIS 수급 수집 실패 ({stock_code}): {e}")
        return []


def collect_news():
    """전체 관심 종목 뉴스 + 수급 + 공매도 잔고 + 분기 실적 수집 (배치 Claude 분석)"""
    print("\n[뉴스/수급/공매도/실적 수집]")

    # Phase 1: 모든 종목 데이터 수집 (Claude 호출 없음)
    collected: list[dict] = []
    for name, code in WATCH_STOCKS.items():
        print(f"  {name} 수집...", end=" ", flush=True)
        try:
            articles = fetch_naver_news(code)
            investor = fetch_investor_trading(code)
            short = fetch_short_balance(code)
            earnings = fetch_earnings_trend(code)
            collected.append({
                "name": name, "code": code,
                "articles": articles, "investor": investor,
                "short": short, "earnings": earnings,
            })
            print(f"{len(articles)}개")
        except Exception as e:
            print(f"실패: {e}")
        time.sleep(0.5)

    # Phase 2: BATCH_SIZE 단위로 Claude 배치 분석
    stock_articles = [(d["name"], d["articles"]) for d in collected]
    analyses: dict[str, dict] = {}
    for i in range(0, len(stock_articles), BATCH_SIZE):
        batch = stock_articles[i : i + BATCH_SIZE]
        names = [n for n, _ in batch]
        print(f"  Claude 배치 분석 [{i+1}~{i+len(batch)}] {names}...", flush=True)
        batch_result = analyze_news_batch(batch)
        analyses.update(batch_result)

    # Phase 3: Supabase 저장
    for d in collected:
        name, code = d["name"], d["code"]
        analysis = analyses.get(name, {})
        short, earnings = d["short"], d["earnings"]
        try:
            sb_post("stock_news", {
                "stock_code": code,
                "stock_name": name,
                "collected_at": now_kst().isoformat(),
                "articles": json.dumps(d["articles"][:10], ensure_ascii=False),
                "analysis": json.dumps(analysis, ensure_ascii=False),
                "investor_data": json.dumps(d["investor"][:10], ensure_ascii=False),
                "short_data": json.dumps(short[:5], ensure_ascii=False),
                "earnings_data": json.dumps(earnings[:4], ensure_ascii=False),
                "sentiment": analysis.get("sentiment", "중립"),
                "trading_signal": analysis.get("trading_signal", "관망"),
                "news_impact_score": analysis.get("news_impact_score", 5),
            }, on_conflict="stock_code")
            short_info = f" | 공매도 {short[0]['balance_ratio']:.2f}%" if short else ""
            earn_info = f" | 영업이익 {earnings[0]['op_profit']:,}" if earnings else ""
            print(f"  {name}: {analysis.get('sentiment', '?')}{short_info}{earn_info}")
        except Exception as e:
            print(f"  {name} 저장 실패: {e}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 2: 유튜브 수집 (기존 railway_collector 로직 재사용)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def collect_youtube(collect_time=None):
    """유튜브 수집 (railway_collector.py의 collect 함수 호출)"""
    print(f"\n[유튜브 수집 - {collect_time or '전체'}]")
    try:
        # railway_collector를 직접 import해서 사용
        from railway_collector import collect
        collect(collect_time=collect_time)
    except Exception as e:
        print(f"  유튜브 수집 실패: {e}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 3: 브리핑 생성
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_BRIEFING_SYSTEM = "당신은 한국 주식 시장 전문 애널리스트입니다. 주어진 데이터를 분석해 아침 브리핑을 JSON 형식으로 작성하세요."


def generate_briefing():
    """아침/저녁 브리핑 생성"""
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    print("\n[브리핑 생성]")

    # 데이터 수집
    youtube = sb_get("youtube_insights",
                     "select=title,channel,summary,market_sentiment,market_narrative,key_stocks,key_stocks_analysis,key_events,key_sectors,trading_type,urgency"
                     "&order=processed_at.desc&limit=20")
    news = sb_get("stock_news",
                  "select=stock_name,stock_code,analysis,articles,investor_data,sentiment"
                  "&order=collected_at.desc&limit=10")

    # 시장 데이터
    try:
        import yfinance as yf
        kospi = yf.Ticker("^KS11").history(period="5d")
        kosdaq = yf.Ticker("^KQ11").history(period="5d")
        def fmt(df, name):
            if df.empty: return {}
            last, prev = df.iloc[-1], df.iloc[-2] if len(df) > 1 else df.iloc[-1]
            chg = last["Close"] - prev["Close"]
            return {"name": name, "close": round(float(last["Close"]), 2),
                    "change_pct": round(float(chg / prev["Close"] * 100), 2)}
        market = {"kospi": fmt(kospi, "코스피"), "kosdaq": fmt(kosdaq, "코스닥")}
    except:
        market = {}

    # Claude 브리핑 — YouTube 데이터 (market_narrative + 종목별 signal + key_events 포함)
    yt_lines = []
    all_key_events = []
    for i in youtube[:15]:
        # 종목별 signal 파싱
        analysis_raw = i.get("key_stocks_analysis")
        stock_signals = {}
        if analysis_raw:
            try:
                for entry in (json.loads(analysis_raw) if isinstance(analysis_raw, str) else analysis_raw or []):
                    stock_signals[entry["name"]] = entry.get("signal", "관망")
            except Exception:
                pass
        signal_str = " / ".join(f"{n}:{s}" for n, s in list(stock_signals.items())[:4]) if stock_signals else ", ".join(i.get("key_stocks", [])[:3])

        # key_events 수집
        ev_raw = i.get("key_events")
        if ev_raw:
            try:
                evs = json.loads(ev_raw) if isinstance(ev_raw, str) else ev_raw
                all_key_events.extend(evs or [])
            except Exception:
                pass

        narrative = i.get("market_narrative") or i.get("summary", "")
        line = (f"- [{i.get('market_sentiment','중립')}][{i.get('urgency','이번주')}] "
                f"{i.get('title','')} ({i.get('channel','')})\n"
                f"  흐름: {narrative[:120]}\n"
                f"  종목신호: {signal_str}")
        yt_lines.append(line)
    yt_text = "\n".join(yt_lines) or "없음"

    # 중복 제거한 key_events
    unique_events = list(dict.fromkeys(all_key_events))[:8]
    events_text = ", ".join(unique_events) if unique_events else "없음"

    # 종목별 뉴스 상세 (기사 제목 + 분석 포함)
    news_lines = []
    for i in news[:10]:
        a = json.loads(i['analysis']) if isinstance(i['analysis'], str) else i.get('analysis', {})
        arts = json.loads(i['articles']) if isinstance(i.get('articles', '[]'), str) else i.get('articles', [])
        top_titles = " / ".join(x['title'] for x in arts[:3]) if arts else ""
        catalysts = ", ".join(a.get('catalysts', [])[:2])
        risks = ", ".join(a.get('risk_factors', [])[:2])
        signal = a.get('trading_signal', '')
        score = a.get('news_impact_score', '')
        line = (f"- {i['stock_name']} [{a.get('sentiment','중립')}][{signal}][영향{score}]"
                f"\n  뉴스: {top_titles}"
                f"\n  촉매: {catalysts} | 리스크: {risks}")
        news_lines.append(line)
    news_text = "\n".join(news_lines) or "없음"

    kospi = market.get("kospi", {})
    kosdaq = market.get("kosdaq", {})
    market_text = (f"코스피: {kospi.get('close','?')} ({kospi.get('change_pct',0):+.2f}%)\n"
                   f"코스닥: {kosdaq.get('close','?')} ({kosdaq.get('change_pct',0):+.2f}%)")

    prompt = f"""한국 주식 시장 전문 애널리스트로서 오늘({today_kst()}) 아침 브리핑을 작성하세요.

=== 시장 지수 ===
{market_text}

=== 이번주 주목 이벤트/일정 ===
{events_text}

=== 유튜브 전문가 의견 (흐름 + 종목별 매수/관망/매도 신호 포함) ===
{yt_text}

=== 종목별 뉴스 + 수급 분석 ===
{news_text}

아래 JSON 형식으로만 응답하세요. 마크다운, 코드블록, 주석 없이 순수 JSON만 출력하세요.

{{
  "market_summary": "시장 요약 5~8줄",
  "top_stocks": [
    {{"name": "종목명", "reason": "주목 이유", "signal": "매수관심"}}
  ],
  "sector_outlook": [
    {{"sector": "섹터명", "outlook": "긍정", "reason": "이유"}}
  ],
  "expert_consensus": "전문가 종합 의견 3~4줄",
  "risk_alerts": ["리스크1", "리스크2"]
}}"""

    briefing = {}
    try:
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=[{"type": "text", "text": _BRIEFING_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        # 마크다운 코드블록 제거
        text = re.sub(r'```(?:json)?\s*', '', text)
        # JSON 파싱 시도
        try:
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                briefing = json.loads(match.group())
        except json.JSONDecodeError:
            # 폴백: 각 필드를 개별 정규식으로 추출
            def extract_str(key):
                m = re.search(rf'"{key}"\s*:\s*"(.*?)"(?=\s*[,}}])', text, re.DOTALL)
                return m.group(1).replace('\n', ' ').strip() if m else ""
            def extract_list(key):
                m = re.search(rf'"{key}"\s*:\s*(\[.*?\])', text, re.DOTALL)
                if not m: return []
                try: return json.loads(m.group(1))
                except: return []
            briefing = {
                "market_summary": extract_str("market_summary"),
                "top_stocks": extract_list("top_stocks"),
                "sector_outlook": extract_list("sector_outlook"),
                "expert_consensus": extract_str("expert_consensus"),
                "risk_alerts": extract_list("risk_alerts"),
            }
            print(f"  폴백 파싱 사용")
    except Exception as e:
        print(f"  브리핑 생성 실패: {e}")
        briefing = {"market_summary": "생성 실패"}

    # 수급 요약
    investor_flow = {}
    for item in news:
        inv = item.get("investor_data", [])
        if isinstance(inv, str):
            try: inv = json.loads(inv)
            except: inv = []
        if inv:
            investor_flow[item["stock_name"]] = {
                "foreign_5d": sum(d.get("foreign_net", 0) for d in inv[:5]),
                "institution_5d": sum(d.get("institution_net", 0) for d in inv[:5]),
            }

    sb_post("morning_briefing", {
        "briefing_date": today_kst().isoformat(),
        "market_summary": briefing.get("market_summary", ""),
        "top_stocks": json.dumps(briefing.get("top_stocks", []), ensure_ascii=False),
        "sector_outlook": json.dumps(briefing.get("sector_outlook", []), ensure_ascii=False),
        "expert_consensus": briefing.get("expert_consensus", ""),
        "risk_alerts": json.dumps(briefing.get("risk_alerts", []), ensure_ascii=False),
        "investor_flow": json.dumps(investor_flow, ensure_ascii=False),
        "raw_data": json.dumps({"market": market, "generated_at": now_kst().isoformat()}, ensure_ascii=False),
    }, on_conflict="briefing_date")

    print(f"  브리핑 저장 완료")
    print(f"  요약: {briefing.get('market_summary', '')[:100]}...")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 3-B: 섹터 인덱스 수집 (theme-preview 실시간 데이터)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _classify_sector_phase(history: list[dict]) -> tuple[str, int]:
    """5주 종가 추세로 섹터 국면 판별.
    Returns: (phase, score_0_to_100)
    phase: 상승기 | 진입기 | 과열 | 하락기 | 침체
    """
    closes = [row["close_index"] for row in history if row.get("close_index")]
    if len(closes) < 2:
        return "침체", 30

    latest = closes[-1]
    oldest = closes[0]
    pct_change = (latest - oldest) / oldest * 100 if oldest else 0

    # 5주 추세 기울기 (선형 회귀 대신 단순 기울기)
    slope = (closes[-1] - closes[0]) / max(len(closes) - 1, 1)
    avg   = sum(closes) / len(closes)

    # RSI-style 과열 판단
    gains  = sum(c - p for c, p in zip(closes[1:], closes) if c > p)
    losses = sum(p - c for c, p in zip(closes[1:], closes) if c < p)
    rs     = gains / losses if losses else 100
    rsi    = 100 - 100 / (1 + rs)

    # 점수 산출 (0~100)
    base_score = 50 + min(max(pct_change * 3, -40), 40)
    score = int(min(max(base_score, 0), 100))

    if rsi >= 75:
        return "과열", min(score + 10, 95)
    if pct_change >= 5 and slope > 0:
        return "상승기", score
    if 1 <= pct_change < 5 and slope > 0:
        return "진입기", score
    if pct_change <= -5:
        return "하락기", score
    return "침체", score  # 횡보(-5%~+1%) 포함


def collect_stock_prices(days: int = 5) -> None:
    """KIS OHLCV 일봉 → Supabase stock_prices 저장 (백테스트 가격 소스).

    Args:
        days: 최근 N 거래일치만 저장 (일반 크론: 5일, 초기 적재: 400일)
    """
    print(f"\n[KIS 주가 수집 → stock_prices ({days}일)]")
    try:
        kis = get_kis_client()
    except Exception as e:
        print(f"  KIS 클라이언트 오류: {e}")
        return

    # WATCH_STOCKS 기준 수집
    for name, code in WATCH_STOCKS.items():
        ticker = _ticker_sym(code)
        try:
            rows = kis.fetch_ohlcv_daily(code, days=days)
            if not rows:
                print(f"  {name}: 데이터 없음")
                continue

            for row in rows:
                sb_post("stock_prices", {
                    "ticker":     ticker,
                    "stock_name": name,
                    "trade_date": row["date"],
                    "open":       row["open"],
                    "high":       row["high"],
                    "low":        row["low"],
                    "close":      row["close"],
                    "volume":     row["volume"],
                    "updated_at": now_kst().isoformat(),
                }, on_conflict="ticker,trade_date")

            latest = rows[-1]
            print(f"  {name}: {len(rows)}일 저장 (최신 {latest['date']} 종가 {latest['close']:,})")

        except Exception as e:
            print(f"  {name} 가격 수집 실패: {e}")


def collect_sector_index() -> None:
    """KIS 업종 지수 수집 → Supabase sector_index / sector_index_history 저장."""
    print("\n[섹터 인덱스 수집]")
    try:
        kis = get_kis_client()
    except Exception as e:
        print(f"  KIS 클라이언트 초기화 실패: {e}")
        return

    # 현재 지수
    sectors = kis.fetch_sector_index()
    updated_at = now_kst().isoformat()
    for s in sectors:
        sb_post("sector_index", {
            "sector_code":   s["sector_code"],
            "sector_name":   s["sector_name"],
            "current_index": s["current_index"],
            "change_pct":    s["change_pct"],
            "volume":        s["volume"],
            "updated_at":    updated_at,
        }, on_conflict="sector_code")

    # 5주 히스토리 + 국면 판별 → sector_index 업데이트
    for s in sectors:
        code = s["sector_code"]
        history = kis.fetch_sector_index_history(code, weeks=5)

        # 히스토리 저장
        for row in history:
            sb_post("sector_index_history", {
                "sector_code": code,
                "trade_date":  row["trade_date"],
                "open_index":  row["open_index"],
                "high_index":  row["high_index"],
                "low_index":   row["low_index"],
                "close_index": row["close_index"],
                "volume":      row["volume"],
            }, on_conflict="sector_code,trade_date")

        # 국면 판별
        phase, phase_score = _classify_sector_phase(history)
        trend = [row["close_index"] for row in history]

        # sector_index에 국면 정보 업데이트
        query = f"sector_code=eq.{code}"
        patch_url = f"{SUPABASE_URL}/rest/v1/sector_index?{query}"
        patch_headers = {**SB_HEADERS, "Prefer": "return=minimal"}
        patch_body = json.dumps({
            "phase":       phase,
            "phase_score": phase_score,
            "trend":       json.dumps(trend),
        }).encode("utf-8")
        patch_req = urllib.request.Request(
            patch_url, data=patch_body, headers=patch_headers, method="PATCH"
        )
        try:
            urllib.request.urlopen(patch_req)
        except Exception as e:
            print(f"  sector_index PATCH 실패 ({code}): {e}")

        print(f"  {s['sector_name']}: {phase} (score={phase_score}, {s['change_pct']:+.2f}%)")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 4: 예측 로그 저장 (Option B 실시간 적중률)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _calc_rsi(closes, period=14):
    if len(closes) < period + 1:
        return 50.0
    gains, losses = [], []
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(diff, 0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-diff, 0)) / period
    if avg_loss == 0:
        return 100.0
    return 100 - 100 / (1 + avg_gain / avg_loss)


def _prediction_score(closes, volumes=None):
    """기술 지표 기반 상승 확률 추정 (0.15 ~ 0.85)"""
    n = len(closes) - 1
    if n < 20:
        return 0.5
    rsi = _calc_rsi(closes)
    m5  = sum(closes[max(n - 4, 0):n + 1]) / min(5, n + 1)
    m20 = sum(closes[max(n - 19, 0):n + 1]) / min(20, n + 1)
    m60 = sum(closes[max(n - 59, 0):n + 1]) / min(60, n + 1) if n >= 59 else m20

    score = 0.5

    # RSI
    if rsi < 30:    score += 0.12
    elif rsi < 40:  score += 0.06
    elif rsi > 70:  score -= 0.12
    elif rsi > 60:  score -= 0.04

    # MA 정배열
    if m5 > m20 > m60:
        score += 0.08
    elif m5 > m20:
        score += 0.04
    else:
        score -= 0.04

    # 단기/중기 수익률
    ret5  = (closes[n] - closes[max(n - 5,  0)]) / closes[max(n - 5,  0)]
    ret20 = (closes[n] - closes[max(n - 20, 0)]) / closes[max(n - 20, 0)]
    score += ret5 * 0.4
    score += ret20 * 0.15

    # 변동성 (최근 10일 일간 수익률 표준편차) — 고변동성이면 불확실성 ↑
    if n >= 11:
        daily_rets = [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(n - 9, n + 1)]
        avg_r = sum(daily_rets) / len(daily_rets)
        vol10 = (sum((r - avg_r) ** 2 for r in daily_rets) / len(daily_rets)) ** 0.5
        if vol10 > 0.03:
            score -= 0.05  # 고변동성 패널티

    # 거래량 모멘텀
    if volumes and len(volumes) >= 21:
        avg_vol = sum(volumes[-21:-1]) / 20
        if avg_vol > 0:
            vr = volumes[-1] / avg_vol
            if vr >= 2.0:   score += 0.05
            elif vr <= 0.5: score -= 0.03

    return max(0.15, min(0.85, score))


def sb_patch(table, match_params, data):
    """Supabase REST PATCH (부분 업데이트)"""
    query = "&".join(f"{k}=eq.{v}" for k, v in match_params.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    headers = {**SB_HEADERS, "Prefer": "return=minimal"}
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="PATCH")
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        print(f"  PATCH 실패: {e}")


def fetch_naver_closes(code: str, count: int = 90) -> list:
    """종가 리스트 반환 (오래된 순). KIS 우선, Naver fchart fallback."""
    try:
        from kis_fetcher import get_client as _get_kis
        rows = _get_kis().fetch_ohlcv_daily(code, days=count)
        if rows:
            return [r["close"] for r in rows]
    except Exception:
        pass
    closes, _ = fetch_naver_ohlcv(code, count)
    return closes


def fetch_naver_ohlcv(code: str, count: int = 260) -> tuple:
    """네이버 fchart API로 일별 (종가 리스트, 거래량 리스트) 반환 (오래된 순)"""
    url = (f"https://fchart.stock.naver.com/sise.nhn"
           f"?symbol={code}&timeframe=day&count={count}&requestType=0")
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com"}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("euc-kr", errors="replace")
        # XML: <item data="YYYYMMDD|open|high|low|close|volume"/>
        items = re.findall(r'data="([^"]+)"', raw)
        closes, volumes = [], []
        for item in items:
            parts = item.split("|")
            if len(parts) >= 5 and parts[4]:
                try:
                    closes.append(float(parts[4]))
                    volumes.append(float(parts[5]) if len(parts) >= 6 and parts[5] else 0.0)
                except ValueError:
                    pass
        return closes, volumes
    except Exception as e:
        print(f"  네이버 시세 수집 실패({code}): {e}")
        return [], []


def _ticker_sym(code: str) -> str:
    """종목코드 → ticker 심볼 (코스닥 판별)"""
    kosdaq_prefixes = ("0", "1", "2", "3")  # 코스닥은 보통 0으로 시작
    # 코스피 대형주 코드 범위로 간단 구분
    kospi_codes = {"005930","000660","207940","068270","005380","000270",
                   "035420","035720","105560","055550","138040","066570",
                   "028260","097950","009540","010140","012450","034020",
                   "000720","006400","090430","028300","373220",
                   "000100","079550","189300","323410","259960"}
    return f"{code}.KS" if code in kospi_codes else f"{code}.KQ"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 복합 예측 점수 (기술 + ML + 뉴스 + 유튜브)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _load_recent_signals(days: int = 3):
    """최근 N일 뉴스+유튜브 시그널 + 외국인/기관 수급 사전 로드"""
    since = (today_kst() - timedelta(days=days)).isoformat()

    try:
        news_rows = sb_get("stock_news",
            f"collected_at=gte.{since}T00:00:00"
            f"&select=stock_name,sentiment,trading_signal,news_impact_score,investor_data,short_data,earnings_data"
            f"&order=collected_at.desc&limit=500")
    except Exception:
        news_rows = []

    news_by_stock: dict = {}
    for r in news_rows:
        n = r.get("stock_name", "")
        news_by_stock.setdefault(n, []).append(r)

    try:
        yt_rows = sb_get("youtube_insights",
            f"upload_date=gte.{since}"
            f"&select=market_sentiment,urgency,key_stocks,key_stocks_sentiment,key_stocks_analysis,key_events,market_narrative,trading_type,risk_factors,key_sectors"
            f"&limit=100")
    except Exception:
        yt_rows = []

    return news_by_stock, yt_rows


def _foreign_flow_score(name: str, news_by_stock: dict) -> float:
    """외국인+기관 수급 패턴 점수 (-0.5 ~ +0.5)

    [패턴 우선순위]
    1. 기관 선매수 + 외국인 후행 시작 (최강): +0.5
       - 3~5일 전 기관 순매수 → 최근 1~2일 외국인 전환
    2. 외국인+기관 동반 순매수: +0.4
    3. 외국인만 강하게 순매수 (5일 100억+): +0.3
    4. 외국인만 소폭 순매수 (5일 30억+): +0.2
    5. 외국인+기관 동반 순매도: -0.4
    6. 외국인 강한 순매도 (5일 -100억 이하): -0.3
    7. 소폭 변동: 0.0

    단위: 주 × 종가 → 억원으로 환산
    """
    rows = news_by_stock.get(name, [])
    inv_data = []
    for r in rows:
        raw = r.get("investor_data")
        if not raw:
            continue
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
            if parsed:
                inv_data = parsed[:5]  # 최근 5거래일
                break
        except Exception:
            pass

    if not inv_data:
        return 0.0

    # 억원 환산 (주 × 종가 / 1억)
    def to_ukr(shares, close):
        try:
            return float(shares or 0) * float(close or 0) / 1_0000_0000
        except Exception:
            return 0.0

    days = []
    for d in inv_data:
        close = d.get("close", 0)
        days.append({
            "foreign":     to_ukr(d.get("foreign_net", 0), close),
            "institution": to_ukr(d.get("institution_net", 0), close),
        })

    if not days:
        return 0.0

    # 전체 5일 합계
    foreign_5d     = sum(d["foreign"] for d in days)
    institution_5d = sum(d["institution"] for d in days)

    # 패턴: 기관 선매수(3~5일 전) + 외국인 최근 전환
    # days[0]이 가장 최근, days[-1]이 가장 오래된
    recent_foreign  = sum(d["foreign"] for d in days[:2])      # 최근 2일
    early_instit    = sum(d["institution"] for d in days[2:])  # 3~5일 전 기관

    institution_led = early_instit > 30 and recent_foreign > 10

    if institution_led:
        return 0.5   # 기관 선매수 + 외국인 후행 = 최강 패턴

    if foreign_5d > 50 and institution_5d > 30:
        return 0.4   # 외국인 + 기관 동반 매수

    if foreign_5d >= 100:
        return 0.3
    elif foreign_5d >= 30:
        return 0.2

    if foreign_5d < -50 and institution_5d < -30:
        return -0.4  # 외국인 + 기관 동반 매도

    if foreign_5d <= -100:
        return -0.3
    elif foreign_5d <= -30:
        return -0.2

    return 0.0


_market_filter_cache: dict = {}


def _market_filter_score() -> float:
    """KOSPI MA20 필터: 하락장이면 -1.0 패널티 (파이프라인 내 1회 캐시).
    Supabase sector_index_history(0001=KOSPI) 사용 — fchart Naver 의존 제거."""
    if "score" in _market_filter_cache:
        return _market_filter_cache["score"]
    try:
        rows = sb_get("sector_index_history",
                      "sector_code=eq.0001&select=date,close_price"
                      "&order=date.desc&limit=25")
        closes = [r["close_price"] for r in rows if r.get("close_price")][::-1]
        if len(closes) < 20:
            score = 0.0
        else:
            ma20 = sum(closes[-20:]) / 20
            direction = "상승" if closes[-1] >= ma20 else "하락"
            score = 0.0 if closes[-1] >= ma20 else -1.0
            print(f"  [시장필터] KOSPI {closes[-1]:,.2f} / MA20 {ma20:,.2f} → {direction}장 ({score:+.1f})")
    except Exception as e:
        print(f"  [시장필터] KOSPI 조회 실패: {e}")
        score = 0.0
    _market_filter_cache["score"] = score
    return score


def _breakout_score(closes: list) -> float:
    """52주 신고가 근접 (+0.5): 현재가 > 52주 최고가 × 95%"""
    if len(closes) < 20:
        return 0.0
    lookback = closes[-252:] if len(closes) >= 252 else closes
    high_52w = max(lookback)
    return 0.5 if closes[-1] > high_52w * 0.95 else 0.0


def _volume_surge_score(volumes: list) -> float:
    """거래량 폭발 감지 (+0.3): 오늘 거래량 > 20일 평균 × 3"""
    if len(volumes) < 22:
        return 0.0
    avg_vol = sum(volumes[-21:-1]) / 20
    return 0.3 if avg_vol > 0 and volumes[-1] > avg_vol * 3 else 0.0


def _compute_sector_momentum(stock_data: dict, yt_rows: list = None) -> dict:
    """섹터별 5일 수익률 평균 + 유튜브 섹터 언급 보너스
    Returns: {섹터명: avg_5d_return_pct (YT 보너스 포함)}
    """
    sector_returns: dict = {}
    for name, (closes, _) in stock_data.items():
        sector = SECTOR_MAP.get(name)
        if not sector or len(closes) < 6:
            continue
        ret5 = (closes[-1] - closes[-6]) / closes[-6] * 100
        sector_returns.setdefault(sector, []).append(ret5)

    result = {}
    for sector, rets in sector_returns.items():
        avg = sum(rets) / len(rets)
        result[sector] = round(avg, 2)
        print(f"  [섹터모멘텀] {sector}: {avg:+.2f}% ({len(rets)}종목)")

    # 유튜브 섹터 언급 보너스 (많이 언급된 섹터에 최대 +0.5% 추가)
    if yt_rows:
        sector_mentions: dict = {}
        for r in yt_rows:
            sectors_raw = r.get("key_sectors") or []
            if isinstance(sectors_raw, str):
                try:
                    sectors_raw = json.loads(sectors_raw)
                except Exception:
                    sectors_raw = []
            for s in (sectors_raw if isinstance(sectors_raw, list) else []):
                sector_mentions[s] = sector_mentions.get(s, 0) + 1

        if sector_mentions:
            max_cnt = max(sector_mentions.values())
            for sector, cnt in sector_mentions.items():
                boost = round(cnt / max_cnt * 0.5, 2)
                if sector in result:
                    result[sector] = round(result[sector] + boost, 2)
                else:
                    result[sector] = boost
            print(f"  [섹터모멘텀] YT 언급 보너스 적용: {dict(list(sector_mentions.items())[:5])}")

    return result


def _sector_momentum_score(name: str, sector_momentum: dict) -> float:
    """섹터 모멘텀 점수 (-0.3 ~ +0.3)
    섹터 5일 평균 수익률: +3%이상 → +0.3, +1~3% → +0.15
                         -3%이하 → -0.3, -1~-3% → -0.15
    """
    sector = SECTOR_MAP.get(name)
    if not sector:
        return 0.0
    avg = sector_momentum.get(sector, 0.0)
    if avg >= 3.0:
        return 0.3
    elif avg >= 1.0:
        return 0.15
    elif avg <= -3.0:
        return -0.3
    elif avg <= -1.0:
        return -0.15
    return 0.0


def _short_balance_score(name: str, news_by_stock: dict) -> float:
    """공매도 잔고 감소 점수 (-0.2 ~ +0.2)

    [기준] 공매도잔고비율(%) 5일 추세
      잔고비율 감소 > 0.5%p AND 최신 잔고비율 < 1.5%  → +0.2 (숏커버링 본격화)
      잔고비율 감소 > 0.2%p                            → +0.1 (완만한 감소)
      잔고비율 증가 > 0.5%p                            → -0.2 (공매도 확대)
      잔고비율 증가 > 0.2%p                            → -0.1 (소폭 증가)
      데이터 없음 / 변동 없음                           → 0.0
    """
    rows = news_by_stock.get(name, [])
    short_data = []
    for r in rows:
        raw = r.get("short_data")
        if not raw:
            continue
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
            if parsed:
                short_data = parsed[:5]
                break
        except Exception:
            pass

    if len(short_data) < 2:
        return 0.0

    ratios = [d.get("balance_ratio", 0.0) for d in short_data if d.get("balance_ratio") is not None]
    if len(ratios) < 2:
        return 0.0

    # ratios[0] = 가장 최근, ratios[-1] = 가장 오래된
    change = ratios[-1] - ratios[0]  # 양수 = 잔고 감소 (오래된 - 최신)

    if change >= 0.5 and ratios[0] < 1.5:
        return 0.2   # 잔고 크게 줄고 절대값도 낮음 → 숏커버 마무리
    elif change >= 0.2:
        return 0.1   # 완만한 감소
    elif change <= -0.5:
        return -0.2  # 공매도 확대
    elif change <= -0.2:
        return -0.1  # 소폭 증가
    return 0.0


def _earnings_score(name: str, news_by_stock: dict) -> float:
    """분기 실적 추이 점수 (-0.3 ~ +0.3)

    최근 4분기 영업이익 기준:
      3분기 연속 증가          → +0.3
      2분기 연속 증가          → +0.2
      최근 분기만 흑자 전환    → +0.1
      2분기 연속 감소          → -0.2
      3분기 연속 감소          → -0.3
      데이터 부족 / 변동 없음  → 0.0
    """
    rows = news_by_stock.get(name, [])
    earnings = []
    for r in rows:
        raw = r.get("earnings_data")
        if not raw:
            continue
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
            if parsed:
                earnings = parsed
                break
        except Exception:
            pass

    profits = [e.get("op_profit", 0) for e in earnings if e.get("op_profit") is not None]
    if len(profits) < 2:
        return 0.0

    # profits[0] = 가장 최근 분기
    def growing(i):  # profits[i] > profits[i+1] (최신 > 이전)
        return len(profits) > i + 1 and profits[i] > profits[i + 1]

    def declining(i):
        return len(profits) > i + 1 and profits[i] < profits[i + 1]

    if len(profits) >= 4 and growing(0) and growing(1) and growing(2):
        return 0.3
    if len(profits) >= 3 and growing(0) and growing(1):
        return 0.2
    if growing(0) and profits[1] <= 0 < profits[0]:
        return 0.1  # 흑자 전환
    if len(profits) >= 3 and declining(0) and declining(1) and declining(2):
        return -0.3
    if len(profits) >= 3 and declining(0) and declining(1):
        return -0.2
    return 0.0


def _news_score_for(name: str, news_by_stock: dict) -> float:
    """뉴스 점수: sentiment × trading_signal × impact → 합산 (max 2.0)"""
    rows = news_by_stock.get(name, [])
    if not rows:
        return 0.0
    total = 0.0
    for r in rows:
        s = {"긍정": 0.5, "호재": 0.5, "중립": 0.0, "부정": -0.5, "악재": -0.5}.get(r.get("sentiment", "중립"), 0.0)
        t = {"매수": 0.5, "매수시작": 0.5, "관망": 0.0, "매도": -0.5}.get(r.get("trading_signal", "관망"), 0.0)
        impact = float(r.get("news_impact_score") or 5.0) / 10.0
        total += (s + t) * impact
    return max(-1.0, min(2.0, total))


def _yt_score_for(name: str, yt_rows: list) -> float:
    """유튜브 점수 (max 1.0):
    우선순위: key_stocks_analysis.signal > key_stocks_sentiment > market_sentiment(fallback)

    signal 기반 (가장 정확):
      매수=0.7, 관망=0.0, 매도=-0.5  × urgency × trading_type_weight

    sentiment 기반 (signal 없을 때):
      긍정=0.4, 중립=0.0, 부정=-0.4  × urgency × trading_type_weight

    fallback (key_stocks_analysis/sentiment 둘 다 없을 때):
      market_sentiment 긍정=0.15, 중립=0.0, 부정=-0.15

    패널티:
      risk_factors ≥ 3개 → -0.3, ≥ 2개 → -0.15 (영상별 적용)
    """
    relevant = [r for r in yt_rows if name in (r.get("key_stocks") or [])]
    if not relevant:
        return 0.0

    total = 0.0
    for r in relevant:
        u = {"오늘": 1.0, "이번주": 0.7, "장기": 0.4}.get(r.get("urgency", "이번주"), 0.5)

        # trading_type 가중치: 단타 영상은 단기 신호에 더 적합
        type_w = {"단타": 1.2, "스윙": 1.0, "장기": 0.7}.get(r.get("trading_type", "스윙"), 1.0)
        u = u * type_w

        # 1순위: key_stocks_analysis의 signal 값
        analysis_raw = r.get("key_stocks_analysis")
        stock_signal = None
        if analysis_raw:
            try:
                analysis_list = json.loads(analysis_raw) if isinstance(analysis_raw, str) else analysis_raw
                for entry in (analysis_list or []):
                    if entry.get("name") == name:
                        stock_signal = entry.get("signal")
                        break
            except Exception:
                pass

        if stock_signal:
            s = {"매수": 0.7, "관망": 0.0, "매도": -0.5}.get(stock_signal, 0.0)
            total += s * u
        else:
            # 2순위: key_stocks_sentiment
            sentiments_raw = r.get("key_stocks_sentiment")
            if isinstance(sentiments_raw, str):
                try:
                    sentiments_raw = json.loads(sentiments_raw)
                except Exception:
                    sentiments_raw = {}
            stock_sent = (sentiments_raw or {}).get(name)
            if stock_sent:
                s = {"긍정": 0.4, "중립": 0.0, "부정": -0.4}.get(stock_sent, 0.0)
                total += s * u
            else:
                # 3순위 fallback: 영상 전체 market_sentiment (가중치 낮음)
                s = {"긍정": 0.15, "중립": 0.0, "부정": -0.15}.get(r.get("market_sentiment", "중립"), 0.0)
                total += s * u

        # risk_factors 패널티 (영상별 적용)
        try:
            risks_raw = r.get("risk_factors") or "[]"
            risks = json.loads(risks_raw) if isinstance(risks_raw, str) else risks_raw
            n_risks = len(risks) if isinstance(risks, list) else 0
            if n_risks >= 3:
                total -= 0.3
            elif n_risks >= 2:
                total -= 0.15
        except Exception:
            pass

    return max(-0.5, min(1.0, total))


def _ml_score_from_prob(prob: float) -> float:
    """ML 확률 → 0~2 점수 (prob=0.45→0, prob=0.65→2)"""
    return max(0.0, min(2.0, (prob - 0.45) * 10.0))


def _composite_score(tech: float, prob: float, news: float, yt: float,
                     foreign: float = 0.0, market: float = 0.0,
                     breakout: float = 0.0, vol_surge: float = 0.0,
                     sector: float = 0.0, short: float = 0.0,
                     earnings: float = 0.0) -> float:
    """종합 신뢰도 점수
    기술(0~5) + ML(0~2) + 뉴스(-1~2) + 유튜브(-0.5~1) + 외국인(-0.5~0.5)
    + 시장필터(-1~0) + 52주신고가(0~0.5) + 거래량폭발(0~0.3) + 섹터모멘텀(-0.3~0.3)
    + 공매도잔고(-0.2~0.2) + 실적추이(-0.3~0.3) = 이론상 최대 12.6
    """
    return round(tech + _ml_score_from_prob(prob) + news + yt + foreign
                 + market + breakout + vol_surge + sector + short + earnings, 2)


def _collect_stock_data() -> dict:
    """전 종목 OHLCV 수집 (파이프라인 내 한 번만 호출). KIS 우선, Naver fallback.
    Returns: {종목명: (closes, volumes)}
    """
    print("  [OHLCV 수집] 전 종목 (KIS)...")
    try:
        from kis_fetcher import get_client as _get_kis
        kis = _get_kis()
        _use_kis = True
    except Exception:
        _use_kis = False

    stock_data: dict = {}
    for name, code in WATCH_STOCKS.items():
        try:
            if _use_kis:
                rows = kis.fetch_ohlcv_daily(code, days=260)
                if rows:
                    stock_data[name] = (
                        [r["close"] for r in rows],
                        [r["volume"] for r in rows],
                    )
                    continue
            # Naver fallback
            closes, volumes = fetch_naver_ohlcv(code, count=260)
            if closes:
                stock_data[name] = (closes, volumes)
        except Exception:
            pass
        # KIS 내부에서 rate-limit(0.06s) 처리, Naver fallback 시에만 sleep 필요
        if not _use_kis:
            time.sleep(0.3)
    print(f"  [OHLCV 수집] {len(stock_data)}/{len(WATCH_STOCKS)}종목 완료")
    return stock_data


def save_predictions(stock_data: dict | None = None):
    """오전 수집 후 오늘 예측 저장 + 어제 결과 업데이트 (복합 점수 포함)"""
    print("\n[예측 로그 저장]")

    today = today_kst().isoformat()
    yesterday = (today_kst() - timedelta(days=1)).isoformat()

    news_by_stock, yt_rows = _load_recent_signals(days=3)
    _market_filter_cache.clear()
    market = _market_filter_score()

    if stock_data is None:
        stock_data = _collect_stock_data()

    sector_momentum = _compute_sector_momentum(stock_data, yt_rows)

    for name, code in WATCH_STOCKS.items():
        ticker_sym = _ticker_sym(code)
        if name not in stock_data:
            continue
        try:
            closes, volumes = stock_data[name]
            if len(closes) < 21:
                continue

            prob = _prediction_score(closes, volumes)
            tech = _entry_signal_score(closes, volumes)
            news = _news_score_for(name, news_by_stock)
            yt = _yt_score_for(name, yt_rows)
            foreign = _foreign_flow_score(name, news_by_stock)
            breakout = _breakout_score(closes)
            vol_surge = _volume_surge_score(volumes)
            sector = _sector_momentum_score(name, sector_momentum)
            short = _short_balance_score(name, news_by_stock)
            earn = _earnings_score(name, news_by_stock)
            composite = _composite_score(tech, prob, news, yt, foreign, market, breakout, vol_surge, sector, short, earn)

            sb_post("prediction_log", {
                "date": today,
                "ticker": ticker_sym,
                "predicted_up": prob >= 0.5,
                "probability": round(prob, 4),
                "tech_score": round(tech, 2),
                "ml_score": round(_ml_score_from_prob(prob), 2),
                "news_score": round(news, 2),
                "yt_score": round(yt, 2),
                "composite_score": composite,
            }, on_conflict="date,ticker")

            # 어제 예측의 actual_up + correct 업데이트
            yesterday_rows = sb_get("prediction_log",
                f"date=eq.{yesterday}&ticker=eq.{ticker_sym}&select=predicted_up")
            if yesterday_rows:
                actual_up = closes[-1] > closes[-2] if len(closes) >= 2 else None
                if actual_up is not None:
                    sb_patch("prediction_log",
                        {"date": yesterday, "ticker": ticker_sym},
                        {
                            "actual_up": actual_up,
                            "correct": yesterday_rows[0]["predicted_up"] == actual_up,
                        }
                    )

        except Exception as e:
            print(f"  {name} 예측 실패: {e}")

    print("  예측 로그 저장 완료")


def save_portfolio_signals(stock_data: dict | None = None):
    """오늘 신호 종목을 portfolio_signals에 저장
    조건: tech ≥ 4.0 OR composite ≥ 5.5 (AI가 기술 약세를 보완 가능)
    """
    print("\n[포트폴리오 신호 저장]")

    today = today_kst().isoformat()
    news_by_stock, yt_rows = _load_recent_signals(days=3)
    market = _market_filter_score()  # 캐시에서 재사용

    if stock_data is None:
        stock_data = _collect_stock_data()

    sector_momentum = _compute_sector_momentum(stock_data, yt_rows)

    for name, code in WATCH_STOCKS.items():
        ticker_sym = _ticker_sym(code)
        if name not in stock_data:
            continue
        try:
            closes, volumes = stock_data[name]
            if len(closes) < 61:
                continue

            prob = _prediction_score(closes, volumes)
            tech = _entry_signal_score(closes, volumes)
            news = _news_score_for(name, news_by_stock)
            yt = _yt_score_for(name, yt_rows)
            foreign = _foreign_flow_score(name, news_by_stock)
            breakout = _breakout_score(closes)
            vol_surge = _volume_surge_score(volumes)
            sector = _sector_momentum_score(name, sector_momentum)
            short = _short_balance_score(name, news_by_stock)
            earn = _earnings_score(name, news_by_stock)
            composite = _composite_score(tech, prob, news, yt, foreign, market, breakout, vol_surge, sector, short, earn)

            if tech < 4.0 and composite < 5.5:
                continue

            entry_price = closes[-1]
            sb_post("portfolio_signals", {
                "signal_date": today,
                "ticker": ticker_sym,
                "stock_name": name,
                "entry_price": round(entry_price, 0),
                "current_price": round(entry_price, 0),
                "return_pct": 0.0,
                "signal_score": composite,
                "status": "holding",
                "updated_at": now_kst().isoformat(),
            }, on_conflict="signal_date,ticker")
            print(f"  {name} 신호저장 | 복합={composite} (기술={tech}/섹터={sector}/외국인={foreign}/공매도={short}/실적={earn}/52주={breakout}/거래량={vol_surge}/시장={market}) | 진입가={entry_price:,.0f}")

        except Exception as e:
            print(f"  {name} 포트폴리오 신호 실패: {e}")

    print("  포트폴리오 신호 저장 완료")


def _entry_signal_score(closes, volumes=None):
    """5조건 진입 신호 점수 (≥4 = 매수관심)"""
    n = len(closes) - 1
    if n < 60:
        return 0.0
    score = 0.0

    # 1. MA 정배열 (MA5 > MA20 > MA60)
    ma5  = sum(closes[n-4:n+1]) / 5
    ma20 = sum(closes[n-19:n+1]) / 20
    ma60 = sum(closes[n-59:n+1]) / 60
    if ma5 > ma20 > ma60:
        score += 1.0
    elif ma5 > ma20 or ma20 > ma60:
        score += 0.5

    # 2. 골든크로스 (최근 10일 내 MA5가 MA20 상향돌파)
    crossed = False
    for i in range(max(0, n-10), n):
        prev_ma5  = sum(closes[max(0,i-4):i+1]) / min(5, i+1)
        prev_ma20 = sum(closes[max(0,i-19):i+1]) / min(20, i+1)
        cur_ma5   = sum(closes[max(0,i-3):i+2]) / min(5, i+2)
        cur_ma20  = sum(closes[max(0,i-18):i+2]) / min(20, i+2)
        if prev_ma5 <= prev_ma20 and cur_ma5 > cur_ma20:
            crossed = True
            break
    score += 1.0 if crossed else 0.0

    # 3. RSI 40~60
    rsi = _calc_rsi(closes)
    if 40 <= rsi <= 60:
        score += 1.0
    elif 35 <= rsi <= 65:
        score += 0.5

    # 4. 주간 추세 (5일 전 대비 상승)
    weekly_ret = (closes[n] - closes[max(0, n-5)]) / closes[max(0, n-5)]
    if weekly_ret > 0:
        score += 1.0
    elif weekly_ret > -0.02:
        score += 0.5

    # 5. 거래량 (실제 데이터 사용, 없으면 0.5 중립)
    if volumes and len(volumes) >= 21:
        avg_vol = sum(volumes[-21:-1]) / 20
        if avg_vol > 0:
            vr = volumes[-1] / avg_vol
            if vr >= 1.5:
                score += 1.0   # 거래량 1.5배 이상 → 강한 신호
            elif vr >= 1.0:
                score += 0.5   # 평균 이상
            else:
                score += 0.0   # 거래량 감소 → 점수 없음
        else:
            score += 0.5
    else:
        score += 0.5  # 거래량 데이터 없을 때 중립

    return score


def update_portfolio_returns():
    """오후 파이프라인: holding 상태 포트폴리오의 현재가 + 수익률 업데이트 (네이버 API)"""
    print("\n[포트폴리오 수익률 업데이트]")

    try:
        holdings = sb_get("portfolio_signals",
                          "select=signal_date,ticker,stock_name,entry_price"
                          "&status=eq.holding&order=signal_date.desc&limit=200")
    except Exception as e:
        print(f"  조회 실패: {e}")
        return

    if not holdings:
        print("  보유 종목 없음")
        return

    # 네이버 현재가 조회 (ticker → code 역변환)
    prices = {}
    seen_codes = set()
    for h in holdings:
        code = h["ticker"].split(".")[0]
        if code in seen_codes:
            continue
        seen_codes.add(code)
        try:
            url = f"https://m.stock.naver.com/api/stock/{code}/basic"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())
            price = float(data.get("closePrice", "0").replace(",", ""))
            if price > 0:
                prices[h["ticker"]] = price
        except:
            pass
        time.sleep(0.2)

    updated = 0
    for h in holdings:
        ticker = h["ticker"]
        if ticker not in prices:
            continue
        cur = prices[ticker]
        entry = h["entry_price"]
        ret_pct = round((cur - entry) / entry * 100, 2) if entry else 0.0

        # 손절(-7%) / 익절(+20%) 자동 청산
        if ret_pct <= -7.0:
            new_status = "sold_stoploss"
        elif ret_pct >= 20.0:
            new_status = "sold_takeprofit"
        else:
            new_status = "holding"

        try:
            sb_patch("portfolio_signals",
                     {"signal_date": h["signal_date"], "ticker": ticker},
                     {"current_price": round(cur, 0),
                      "return_pct": ret_pct,
                      "status": new_status,
                      "updated_at": now_kst().isoformat()})
            if new_status != "holding":
                print(f"  {h['stock_name']} → {new_status} ({ret_pct:+.2f}%)")
            updated += 1
        except Exception as e:
            print(f"  {h['stock_name']} 업데이트 실패: {e}")

    print(f"  {updated}개 종목 수익률 업데이트 완료")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 일일 리포트 이메일 발송
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def send_daily_report():
    """매일 아침 분석 리포트를 이메일로 발송 (Gmail SMTP)"""
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    gmail_user = os.environ.get("GMAIL_SENDER", "")
    gmail_pw   = os.environ.get("GMAIL_APP_PASSWORD", "")
    to_email   = os.environ.get("REPORT_EMAIL", gmail_user)

    if not gmail_user or not gmail_pw:
        print("  [리포트] GMAIL_SENDER / GMAIL_APP_PASSWORD 미설정 → 스킵")
        return

    print("\n[일일 리포트 발송]")
    today = today_kst().isoformat()
    yesterday = (today_kst() - timedelta(days=1)).isoformat()

    # ── 오늘 매수 신호 종목 ──
    try:
        signals = sb_get("portfolio_signals",
            f"signal_date=eq.{today}"
            f"&select=stock_name,signal_score,entry_price,tech_score,ml_score,news_score,yt_score"
            f"&order=signal_score.desc")
    except Exception:
        signals = []

    # ── 어제 신호 수익률 ──
    try:
        yesterday_signals = sb_get("portfolio_signals",
            f"signal_date=eq.{yesterday}"
            f"&select=stock_name,signal_score,entry_price,current_price,return_pct"
            f"&order=return_pct.desc")
    except Exception:
        yesterday_signals = []

    # ── 누적 성과 (최근 30일) ──
    since_30 = (today_kst() - timedelta(days=30)).isoformat()
    try:
        all_signals = sb_get("portfolio_signals",
            f"signal_date=gte.{since_30}"
            f"&return_pct=not.is.null"
            f"&select=signal_score,return_pct")
    except Exception:
        all_signals = []

    # ── 예측 적중률 (최근 14일) ──
    since_14 = (today_kst() - timedelta(days=14)).isoformat()
    try:
        pred_rows = sb_get("prediction_log",
            f"date=gte.{since_14}&correct=not.is.null"
            f"&select=correct,composite_score")
    except Exception:
        pred_rows = []

    # ── HTML 생성 ──
    def score_bar(score, max_score=10):
        filled = round((score or 0) / max_score * 10)
        return "█" * filled + "░" * (10 - filled)

    def ret_color(v):
        if v is None: return "#888"
        return "#e03030" if v > 0 else "#3060e0" if v < 0 else "#888"

    def ret_str(v):
        if v is None: return "-"
        return f"{v:+.2f}%"

    # 신호 섹션
    if signals:
        signal_rows = ""
        for s in signals:
            sc = s.get("signal_score") or 0
            bar = score_bar(sc)
            tech = s.get("tech_score") or 0
            ml   = s.get("ml_score") or 0
            news = s.get("news_score") or 0
            yt   = s.get("yt_score") or 0
            signal_rows += f"""
            <tr>
              <td style="padding:10px 8px;font-weight:700;font-size:15px">{s['stock_name']}</td>
              <td style="padding:10px 8px;text-align:center">
                <span style="font-size:18px;font-weight:800;color:#e03030">{sc:.1f}</span>
                <div style="font-family:monospace;font-size:11px;color:#aaa;letter-spacing:-1px">{bar}</div>
              </td>
              <td style="padding:10px 8px;font-size:13px;color:#555">
                기술 <b>{tech:.1f}</b> &nbsp;|&nbsp; ML <b>{ml:.2f}</b> &nbsp;|&nbsp; 뉴스 <b>{news:+.2f}</b> &nbsp;|&nbsp; 유튜브 <b>{yt:+.2f}</b>
              </td>
              <td style="padding:10px 8px;font-size:14px;font-weight:600;font-family:monospace">
                {int(s['entry_price']):,}원
              </td>
            </tr>"""
        signal_section = f"""
        <h2 style="font-size:16px;font-weight:700;color:#191919;margin:24px 0 12px">
          📡 오늘 매수 신호 종목 <span style="font-size:13px;color:#888;font-weight:400">({today})</span>
        </h2>
        <table width="100%" cellspacing="0" style="border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
          <thead>
            <tr style="background:#f7f8fa">
              <th style="padding:8px;text-align:left;font-size:12px;color:#888;font-weight:600">종목</th>
              <th style="padding:8px;text-align:center;font-size:12px;color:#888;font-weight:600">복합점수</th>
              <th style="padding:8px;text-align:left;font-size:12px;color:#888;font-weight:600">점수 구성</th>
              <th style="padding:8px;text-align:left;font-size:12px;color:#888;font-weight:600">진입가</th>
            </tr>
          </thead>
          <tbody>{signal_rows}</tbody>
        </table>"""
    else:
        signal_section = f"""
        <h2 style="font-size:16px;font-weight:700;color:#191919;margin:24px 0 12px">📡 오늘 매수 신호 종목</h2>
        <p style="color:#888;font-size:14px">오늘은 조건을 충족하는 종목이 없습니다.</p>"""

    # 어제 수익률 섹션
    if yesterday_signals:
        yst_rows = ""
        winners = [s for s in yesterday_signals if (s.get("return_pct") or 0) > 0]
        for s in yesterday_signals:
            ret = s.get("return_pct")
            color = ret_color(ret)
            emoji = "✅" if (ret or 0) > 0 else "❌" if (ret or 0) < 0 else "➖"
            yst_rows += f"""
            <tr style="border-bottom:1px solid #f0f0f0">
              <td style="padding:8px">{emoji} <b>{s['stock_name']}</b></td>
              <td style="padding:8px;font-family:monospace">{int(s.get('entry_price') or 0):,}원</td>
              <td style="padding:8px;font-family:monospace">{int(s.get('current_price') or 0):,}원</td>
              <td style="padding:8px;font-weight:800;font-size:16px;color:{color}">{ret_str(ret)}</td>
              <td style="padding:8px;font-size:12px;color:#aaa">복합 {s.get('signal_score') or '-'}</td>
            </tr>"""
        avg_ret = sum(s.get("return_pct") or 0 for s in yesterday_signals) / len(yesterday_signals)
        win_rate = len(winners) / len(yesterday_signals) * 100
        yst_section = f"""
        <h2 style="font-size:16px;font-weight:700;color:#191919;margin:24px 0 12px">
          📊 어제 신호 결과 <span style="font-size:13px;color:#888;font-weight:400">({yesterday})</span>
        </h2>
        <div style="background:#f7f8fa;border-radius:10px;padding:12px 16px;margin-bottom:12px;display:flex;gap:24px">
          <div><span style="font-size:12px;color:#888">평균 수익률</span><br>
            <span style="font-size:22px;font-weight:800;color:{ret_color(avg_ret)}">{avg_ret:+.2f}%</span></div>
          <div><span style="font-size:12px;color:#888">승률</span><br>
            <span style="font-size:22px;font-weight:800;color:#191919">{win_rate:.0f}%</span></div>
          <div><span style="font-size:12px;color:#888">종목 수</span><br>
            <span style="font-size:22px;font-weight:800;color:#191919">{len(yesterday_signals)}개</span></div>
        </div>
        <table width="100%" cellspacing="0" style="border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
          <tbody>{yst_rows}</tbody>
        </table>"""
    else:
        yst_section = ""

    # 누적 성과 섹션
    if all_signals:
        def band_stats(rows, lo, hi):
            sub = [r["return_pct"] for r in rows
                   if lo <= (r.get("signal_score") or 0) < hi
                   and r.get("return_pct") is not None]
            if not sub: return "-", "-", 0
            avg = sum(sub) / len(sub)
            wr  = sum(1 for r in sub if r > 0) / len(sub) * 100
            return f"{avg:+.2f}%", f"{wr:.0f}%", len(sub)

        a_avg, a_wr, a_n = band_stats(all_signals, 7.0, 99)
        b_avg, b_wr, b_n = band_stats(all_signals, 5.5, 7.0)
        c_avg, c_wr, c_n = band_stats(all_signals, 4.0, 5.5)
        total_rets = [r["return_pct"] for r in all_signals if r.get("return_pct") is not None]
        overall_avg = f"{sum(total_rets)/len(total_rets):+.2f}%" if total_rets else "-"
        overall_wr  = f"{sum(1 for r in total_rets if r > 0)/len(total_rets)*100:.0f}%" if total_rets else "-"

        # 예측 적중률
        if pred_rows:
            correct_n = sum(1 for r in pred_rows if r.get("correct"))
            acc_str = f"{correct_n/len(pred_rows)*100:.1f}% ({correct_n}/{len(pred_rows)})"
        else:
            acc_str = "데이터 부족"

        perf_section = f"""
        <h2 style="font-size:16px;font-weight:700;color:#191919;margin:24px 0 12px">
          📈 누적 성과 <span style="font-size:13px;color:#888;font-weight:400">(최근 30일)</span>
        </h2>
        <table width="100%" cellspacing="0" style="border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
          <thead>
            <tr style="background:#f7f8fa">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888">등급</th>
              <th style="padding:10px 12px;text-align:center;font-size:12px;color:#888">평균 수익률</th>
              <th style="padding:10px 12px;text-align:center;font-size:12px;color:#888">승률</th>
              <th style="padding:10px 12px;text-align:center;font-size:12px;color:#888">신호 수</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #f0f0f0">
              <td style="padding:10px 12px"><b style="color:#e03030">A등급</b> <span style="font-size:12px;color:#aaa">7점+</span></td>
              <td style="padding:10px 12px;text-align:center;font-weight:700">{a_avg}</td>
              <td style="padding:10px 12px;text-align:center">{a_wr}</td>
              <td style="padding:10px 12px;text-align:center;color:#888">{a_n}개</td>
            </tr>
            <tr style="border-bottom:1px solid #f0f0f0">
              <td style="padding:10px 12px"><b style="color:#f97316">B등급</b> <span style="font-size:12px;color:#aaa">5.5~7점</span></td>
              <td style="padding:10px 12px;text-align:center;font-weight:700">{b_avg}</td>
              <td style="padding:10px 12px;text-align:center">{b_wr}</td>
              <td style="padding:10px 12px;text-align:center;color:#888">{b_n}개</td>
            </tr>
            <tr>
              <td style="padding:10px 12px"><b style="color:#888">C등급</b> <span style="font-size:12px;color:#aaa">4~5.5점</span></td>
              <td style="padding:10px 12px;text-align:center;font-weight:700">{c_avg}</td>
              <td style="padding:10px 12px;text-align:center">{c_wr}</td>
              <td style="padding:10px 12px;text-align:center;color:#888">{c_n}개</td>
            </tr>
          </tbody>
        </table>
        <p style="font-size:13px;color:#555;margin-top:10px">
          전체 평균: <b>{overall_avg}</b> &nbsp;·&nbsp; 전체 승률: <b>{overall_wr}</b>
          &nbsp;·&nbsp; 예측 적중률(14일): <b>{acc_str}</b>
        </p>"""
    else:
        perf_section = ""

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f2f4f6;margin:0;padding:20px">
  <div style="max-width:620px;margin:0 auto">

    <!-- 헤더 -->
    <div style="background:#191919;border-radius:14px;padding:20px 24px;margin-bottom:16px">
      <div style="font-size:12px;color:#888;margin-bottom:4px">{today} · KST 07:00</div>
      <div style="font-size:22px;font-weight:800;color:#fff">📊 주식 AI 일일 리포트</div>
      <div style="font-size:13px;color:#aaa;margin-top:4px">기술분석 + ML + 뉴스 + 유튜브 복합 신호</div>
    </div>

    <!-- 콘텐츠 -->
    <div style="background:#fff;border-radius:14px;padding:20px 24px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      {signal_section}
      {yst_section}
      {perf_section}

      <!-- 해석 가이드 -->
      <div style="margin-top:24px;padding:14px 16px;background:#f7f8fa;border-radius:10px;font-size:12px;color:#888;line-height:1.8">
        <b style="color:#555">📌 점수 해석</b><br>
        복합점수 = 기술(0~5) + ML확률(0~2) + 뉴스(0~2) + 유튜브(0~1)<br>
        A등급(7+) 🟢 적극 관심 &nbsp;·&nbsp; B등급(5.5~7) 🟡 관심 &nbsp;·&nbsp; C등급(4~5.5) ⚪ 대기<br>
        A등급 수익 > B > C 패턴이 유지되면 신호 시스템이 유효한 것입니다.
      </div>
    </div>

    <p style="text-align:center;font-size:11px;color:#bbb;margin-top:12px">
      자동 발송 · Railway 크론 · 수신 거부: REPORT_EMAIL 환경변수 제거
    </p>
  </div>
</body></html>"""

    # 발송
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"📊 주식 AI 리포트 {today} — 신호 {len(signals)}종목"
        msg["From"]    = gmail_user
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(gmail_user, gmail_pw)
            server.sendmail(gmail_user, to_email, msg.as_string())

        print(f"  리포트 발송 완료 → {to_email}")
    except Exception as e:
        print(f"  리포트 발송 실패: {e}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 메인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def auto_detect_mode():
    """한국 시간(UTC+9) 기준으로 morning/afternoon 자동 판단"""
    from datetime import timezone, timedelta as td
    kst = datetime.now(timezone(td(hours=9)))
    hour = kst.hour
    if hour < 12:
        return "morning"
    else:
        return "afternoon"


def _run_theme_scanner():
    try:
        from theme_scanner import run as theme_run
        theme_run()
    except Exception as e:
        print(f"  [테마 스캐너 오류] {e}", file=sys.stderr)


def _run_factor_calculator():
    try:
        from factor_calculator import run as factor_run
        factor_run()
    except Exception as e:
        import traceback
        print(f"  [팩터 계산 오류] {e}")
        print(traceback.format_exc())


def _run_signal_aggregator():
    try:
        from signal_aggregator import run as signal_run
        signal_run()
    except Exception as e:
        import traceback
        print(f"  [신호 집계 오류] {e}")
        print(traceback.format_exc())


def _run_sniper():
    try:
        from monthly_sniper import run as run_sniper, is_sniper_period
        if is_sniper_period():
            print("\n[스나이퍼] 기간 활성 → 신호 스캔 + 진입")
            run_sniper()
        else:
            print("\n[스나이퍼] 기간 외 → 스킵")
    except Exception as e:
        import traceback
        print(f"  [스나이퍼 오류] {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)


def _run_monthly_agent():
    try:
        from monthly_agent import run_monthly_agent
        run_monthly_agent()
    except Exception as e:
        import traceback
        print(f"  [월간에이전트 오류] {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)


def main():
    global _DATE_OVERRIDE
    args = sys.argv[1:]

    # --date YYYY-MM-DD 파싱
    if "--date" in args:
        idx = args.index("--date")
        _DATE_OVERRIDE = date.fromisoformat(args[idx + 1])
        args = [a for i, a in enumerate(args) if i not in (idx, idx + 1)]

    mode = args[0] if args else auto_detect_mode()
    date_label = f" [{_DATE_OVERRIDE}]" if _DATE_OVERRIDE else ""
    print(f"{'='*50}")
    print(f"  Railway 통합 수집기 [{mode}]{date_label}")
    print(f"  {now_kst().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    if mode == "backfill":
        # 뉴스/유튜브 수집 없이 prediction + portfolio만 저장 (날짜 백필용)
        if not _DATE_OVERRIDE:
            print("  backfill 모드는 --date YYYY-MM-DD 필요")
            sys.exit(1)
        print(f"  백필 대상 날짜: {_DATE_OVERRIDE}")
        stock_data = _collect_stock_data()
        save_predictions(stock_data)
        save_portfolio_signals(stock_data)

    elif mode == "morning":
        collect_news()
        collect_youtube(collect_time="morning")
        generate_briefing()
        collect_stock_prices(days=5)   # KIS 최근 5거래일 가격 저장
        collect_sector_index()
        stock_data = _collect_stock_data()
        save_predictions(stock_data)
        save_portfolio_signals(stock_data)
        update_portfolio_returns()
        _run_theme_scanner()
        _run_factor_calculator()
        _run_signal_aggregator()
        send_daily_report()
        try:
            from monthly_sniper import run as run_sniper, is_sniper_period
            if is_sniper_period():
                print("\n[스나이퍼] 기간 활성 → 신호 스캔 + 진입")
                run_sniper()
        except Exception as e:
            print(f"  [스나이퍼 오류] {e}", file=sys.stderr)
        try:
            from monthly_agent import run_monthly_agent
            run_monthly_agent()
        except Exception as e:
            print(f"  [월급에이전트 오류] {e}", file=sys.stderr)

    elif mode == "afternoon":
        collect_news()
        collect_youtube(collect_time="afternoon")
        generate_briefing()
        update_portfolio_returns()

    else:
        collect_news()
        collect_youtube()
        generate_briefing()
        stock_data = _collect_stock_data()
        save_predictions(stock_data)
        save_portfolio_signals(stock_data)
        update_portfolio_returns()
        _run_theme_scanner()
        _run_factor_calculator()
        _run_signal_aggregator()

    print(f"\n{'='*50}")
    print(f"  완료! {now_kst().strftime('%H:%M:%S')}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
