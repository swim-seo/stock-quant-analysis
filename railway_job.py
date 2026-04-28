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

load_dotenv(Path(__file__).parent / ".env")

KST = timezone(timedelta(hours=9))

def today_kst() -> date:
    return datetime.now(KST).date()

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
    urllib.request.urlopen(req)


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


def fetch_investor_trading(stock_code):
    """네이버 금융에서 외국인/기관 수급"""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    url = f"https://finance.naver.com/item/frgn.naver?code={stock_code}&page=1"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("euc-kr", errors="replace")
    except Exception:
        return []

    results = []
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)
    for row in rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
        if len(cells) < 9:
            continue
        date_match = re.search(r'(\d{4}\.\d{2}\.\d{2})', cells[0])
        if not date_match:
            continue

        def parse_num(text):
            text = re.sub(r'<[^>]+>', '', text).strip().replace(",", "").replace("+", "")
            try: return int(text)
            except: return 0

        results.append({
            "date": date_match.group(1),
            "close": parse_num(cells[1]),
            "foreign_net": parse_num(cells[5]),
            "institution_net": parse_num(cells[6]),
        })
        if len(results) >= 10:
            break
    return results


def analyze_news(stock_name, articles):
    """Claude로 뉴스 분석 (심화 버전)"""
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    if not articles:
        return {"summary": "뉴스 없음", "sentiment": "중립", "key_points": [],
                "catalysts": [], "risk_factors": [], "trading_signal": "관망",
                "news_impact_score": 50, "price_direction": "중립"}

    news_text = "\n".join([f"- [{a['date']}] {a['title']} ({a['source']})" for a in articles[:15]])
    prompt = f"""당신은 한국 주식 전문 애널리스트입니다. '{stock_name}' 관련 최근 뉴스를 분석해주세요.

{news_text}

다음 JSON 형식으로만 출력하세요:
{{
  "summary": "전체 흐름 2~3줄 요약",
  "sentiment": "호재" | "중립" | "악재",
  "key_points": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "catalysts": ["주가 상승 촉매 1", "촉매 2"],
  "risk_factors": ["리스크 1", "리스크 2"],
  "trading_signal": "매수관심" | "관망" | "주의",
  "news_impact_score": 0~100 사이 숫자 (뉴스가 주가에 미치는 긍정적 영향도),
  "price_direction": "상승" | "중립" | "하락"
}}"""

    try:
        msg = client.messages.create(model="claude-sonnet-4-6", max_tokens=1024,
                                     messages=[{"role": "user", "content": prompt}])
        match = re.search(r'\{.*\}', msg.content[0].text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        print(f"  Claude 분석 실패: {e}")
    return {"summary": "분석 실패", "sentiment": "중립", "key_points": [],
            "catalysts": [], "risk_factors": [], "trading_signal": "관망",
            "news_impact_score": 50, "price_direction": "중립"}


def collect_news():
    """전체 관심 종목 뉴스 + 수급 수집"""
    print("\n[뉴스/수급 수집]")
    for name, code in WATCH_STOCKS.items():
        print(f"  {name}...", end=" ")
        articles = fetch_naver_news(code)
        investor = fetch_investor_trading(code)
        analysis = analyze_news(name, articles)

        sb_post("stock_news", {
            "stock_code": code,
            "stock_name": name,
            "collected_at": now_kst().isoformat(),
            "articles": json.dumps(articles[:10], ensure_ascii=False),
            "analysis": json.dumps(analysis, ensure_ascii=False),
            "investor_data": json.dumps(investor[:10], ensure_ascii=False),
            "sentiment": analysis.get("sentiment", "중립"),
        }, on_conflict="stock_code")
        print(f"뉴스 {len(articles)}개 | {analysis.get('sentiment', '?')}")
        time.sleep(1)


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
        msg = client.messages.create(model="claude-sonnet-4-6", max_tokens=2048,
                                     messages=[{"role": "user", "content": prompt}])
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


def _prediction_score(closes):
    """같은 로직을 Python으로 (TypeScript predictionScore 미러)"""
    n = len(closes) - 1
    if n < 20:
        return 0.5
    rsi = _calc_rsi(closes)
    m5 = sum(closes[max(n - 4, 0):n + 1]) / min(5, n + 1)
    m20 = sum(closes[max(n - 19, 0):n + 1]) / min(20, n + 1)
    score = 0.5
    if rsi < 30:   score += 0.12
    elif rsi < 40: score += 0.06
    elif rsi > 70: score -= 0.12
    elif rsi > 60: score -= 0.04
    score += 0.06 if m5 > m20 else -0.06
    ret5 = (closes[n] - closes[max(n - 5, 0)]) / closes[max(n - 5, 0)]
    score += ret5 * 0.5
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
    """네이버 fchart API로 일별 종가 리스트 반환 (오래된 순)"""
    url = (f"https://fchart.stock.naver.com/sise.nhn"
           f"?symbol={code}&timeframe=day&count={count}&requestType=0")
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com"}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("euc-kr", errors="replace")
        # XML: <item data="YYYYMMDD|open|high|low|close|volume"/>
        items = re.findall(r'data="([^"]+)"', raw)
        closes = []
        for item in items:
            parts = item.split("|")
            if len(parts) >= 5 and parts[4]:
                try:
                    closes.append(float(parts[4]))
                except ValueError:
                    pass
        return closes  # 이미 오래된 순(시간 순)
    except Exception as e:
        print(f"  네이버 시세 수집 실패({code}): {e}")
        return []


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
            f"&select=stock_name,sentiment,trading_signal,news_impact_score,investor_data"
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
            f"&select=market_sentiment,urgency,key_stocks,key_stocks_sentiment,key_stocks_analysis,key_events,market_narrative"
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


def _news_score_for(name: str, news_by_stock: dict) -> float:
    """뉴스 점수: sentiment × trading_signal × impact → 합산 (max 2.0)"""
    rows = news_by_stock.get(name, [])
    if not rows:
        return 0.0
    total = 0.0
    for r in rows:
        s = {"긍정": 0.5, "중립": 0.0, "부정": -0.5}.get(r.get("sentiment", "중립"), 0.0)
        t = {"매수": 0.5, "관망": 0.0, "매도": -0.5}.get(r.get("trading_signal", "관망"), 0.0)
        impact = float(r.get("news_impact_score") or 5.0) / 10.0
        total += (s + t) * impact
    return max(-1.0, min(2.0, total))


def _yt_score_for(name: str, yt_rows: list) -> float:
    """유튜브 점수 (max 1.0):
    우선순위: key_stocks_analysis.signal > key_stocks_sentiment > market_sentiment(fallback)

    signal 기반 (가장 정확):
      매수=0.7, 관망=0.0, 매도=-0.5  × urgency

    sentiment 기반 (signal 없을 때):
      긍정=0.4, 중립=0.0, 부정=-0.4  × urgency

    fallback (key_stocks_analysis/sentiment 둘 다 없을 때):
      market_sentiment 긍정=0.15, 중립=0.0, 부정=-0.15
    """
    relevant = [r for r in yt_rows if name in (r.get("key_stocks") or [])]
    if not relevant:
        return 0.0

    total = 0.0
    for r in relevant:
        u = {"오늘": 1.0, "이번주": 0.7, "장기": 0.4}.get(r.get("urgency", "이번주"), 0.5)

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
            continue

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
            continue

        # 3순위 fallback: 영상 전체 market_sentiment (가중치 낮음)
        s = {"긍정": 0.15, "중립": 0.0, "부정": -0.15}.get(r.get("market_sentiment", "중립"), 0.0)
        total += s * u

    return max(-0.5, min(1.0, total))


def _ml_score_from_prob(prob: float) -> float:
    """ML 확률 → 0~2 점수 (prob=0.45→0, prob=0.65→2)"""
    return max(0.0, min(2.0, (prob - 0.45) * 10.0))


def _composite_score(tech: float, prob: float, news: float, yt: float,
                     foreign: float = 0.0) -> float:
    """종합 신뢰도 점수 (0~10)
    기술(0~5) + ML(0~2) + 뉴스(-1~2) + 유튜브(-0.5~1) + 외국인수급(-1~1) = 이론상 최대 11
    외국인이 이 종목을 선별 매수/매도 시 신호 강도 조정
    """
    return round(tech + _ml_score_from_prob(prob) + news + yt + foreign, 2)


def save_predictions():
    """오전 수집 후 오늘 예측 저장 + 어제 결과 업데이트 (복합 점수 포함)"""
    print("\n[예측 로그 저장]")

    today = today_kst().isoformat()
    yesterday = (today_kst() - timedelta(days=1)).isoformat()

    news_by_stock, yt_rows = _load_recent_signals(days=3)

    for name, code in WATCH_STOCKS.items():
        ticker_sym = _ticker_sym(code)
        try:
            closes = fetch_naver_closes(code, count=90)
            if len(closes) < 21:
                continue

            prob = _prediction_score(closes)
            tech = _entry_signal_score(closes)
            news = _news_score_for(name, news_by_stock)
            yt = _yt_score_for(name, yt_rows)
            foreign = _foreign_flow_score(name, news_by_stock)
            composite = _composite_score(tech, prob, news, yt, foreign)

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
        time.sleep(0.3)

    print("  예측 로그 저장 완료")


def save_portfolio_signals():
    """오늘 신호 종목을 portfolio_signals에 저장
    조건: tech ≥ 4.0 OR composite ≥ 5.5 (AI가 기술 약세를 보완 가능)
    """
    print("\n[포트폴리오 신호 저장]")

    today = today_kst().isoformat()
    news_by_stock, yt_rows = _load_recent_signals(days=3)

    for name, code in WATCH_STOCKS.items():
        ticker_sym = _ticker_sym(code)
        try:
            closes = fetch_naver_closes(code, count=90)
            if len(closes) < 61:
                continue

            prob = _prediction_score(closes)
            tech = _entry_signal_score(closes)
            news = _news_score_for(name, news_by_stock)
            yt = _yt_score_for(name, yt_rows)
            foreign = _foreign_flow_score(name, news_by_stock)
            composite = _composite_score(tech, prob, news, yt, foreign)

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
            print(f"  {name} 신호저장 | 복합={composite} (기술={tech}/뉴스={news}/YT={yt}/외국인={foreign}) | 진입가={entry_price:,.0f}")

        except Exception as e:
            print(f"  {name} 포트폴리오 신호 실패: {e}")
        time.sleep(0.3)

    print("  포트폴리오 신호 저장 완료")


def _entry_signal_score(closes):
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

    # 5. 거래량 (단순 근사: 최근 거래량 대비 — yfinance 종가만 있으면 스킵)
    score += 1.0  # 기본 1점 부여 (거래량 데이터 없는 경우)

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
        try:
            sb_patch("portfolio_signals",
                     {"signal_date": h["signal_date"], "ticker": ticker},
                     {"current_price": round(cur, 0),
                      "return_pct": ret_pct,
                      "updated_at": now_kst().isoformat()})
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


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else auto_detect_mode()
    print(f"{'='*50}")
    print(f"  Railway 통합 수집기 [{mode}]")
    print(f"  {now_kst().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    if mode == "morning":
        collect_news()
        collect_youtube(collect_time="morning")
        generate_briefing()
        save_predictions()
        save_portfolio_signals()
        _run_theme_scanner()
        send_daily_report()
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
        save_predictions()
        save_portfolio_signals()
        update_portfolio_returns()
        _run_theme_scanner()

    print(f"\n{'='*50}")
    print(f"  완료! {now_kst().strftime('%H:%M:%S')}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
