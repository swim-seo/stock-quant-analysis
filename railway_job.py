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
from datetime import datetime, date, timedelta

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


def sb_post(table, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    urllib.request.urlopen(req)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 1: 뉴스 수집
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WATCH_STOCKS = {
    "삼성전자": "005930", "SK하이닉스": "000660", "현대차": "005380",
    "NAVER": "035420", "카카오": "035720", "LG에너지솔루션": "373220",
    "셀트리온": "068270", "기아": "000270", "KB금융": "105560",
    "한미반도체": "042700",
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
    """Claude로 뉴스 분석"""
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    if not articles:
        return {"summary": "뉴스 없음", "sentiment": "중립", "key_points": []}

    news_text = "\n".join([f"- [{a['date']}] {a['title']} ({a['source']})" for a in articles[:15]])
    prompt = f"""'{stock_name}' 관련 최근 뉴스입니다.

{news_text}

JSON으로 작성: 1.summary(3줄 요약) 2.sentiment("호재"/"중립"/"악재") 3.key_points(핵심 3~5개) 4.risk_factors(리스크 1~3개) 5.catalysts(촉매 1~3개). JSON만 출력."""

    try:
        msg = client.messages.create(model="claude-sonnet-4-6", max_tokens=1024,
                                     messages=[{"role": "user", "content": prompt}])
        match = re.search(r'\{.*\}', msg.content[0].text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        print(f"  Claude 분석 실패: {e}")
    return {"summary": "분석 실패", "sentiment": "중립", "key_points": []}


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
            "collected_at": datetime.now().isoformat(),
            "articles": json.dumps(articles[:10], ensure_ascii=False),
            "analysis": json.dumps(analysis, ensure_ascii=False),
            "investor_data": json.dumps(investor[:10], ensure_ascii=False),
            "sentiment": analysis.get("sentiment", "중립"),
        })
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
                     "select=title,channel,summary,market_sentiment,key_stocks,key_sectors,trading_type,urgency"
                     "&order=processed_at.desc&limit=20")
    news = sb_get("stock_news",
                  "select=stock_name,stock_code,analysis,investor_data,sentiment"
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

    # Claude 브리핑
    yt_text = "\n".join([
        f"- [{i.get('market_sentiment','중립')}] {i.get('title','')} ({i.get('channel','')}) → {', '.join(i.get('key_stocks',[])[:3])}"
        for i in youtube[:15]
    ]) or "없음"

    news_text = "\n".join([
        f"- {i['stock_name']}: {(json.loads(i['analysis']) if isinstance(i['analysis'], str) else i.get('analysis',{})).get('sentiment','중립')}"
        for i in news[:10]
    ]) or "없음"

    kospi = market.get("kospi", {})
    market_text = f"코스피: {kospi.get('close','?')} ({kospi.get('change_pct',0):+.2f}%)"

    prompt = f"""한국 주식 시장 전문 애널리스트로서 오늘({date.today()}) 아침 브리핑을 작성하세요.

시장: {market_text}
유튜브: {yt_text}
종목 뉴스: {news_text}

JSON: 1.market_summary(5~8줄) 2.top_stocks([{{"name":"","reason":"","signal":"매수관심/관망/주의"}}] 3~5개) 3.sector_outlook([{{"sector":"","outlook":"긍정/중립/부정","reason":""}}] 3~5개) 4.expert_consensus(3~4줄) 5.risk_alerts(1~3개 문자열 리스트). JSON만."""

    try:
        msg = client.messages.create(model="claude-sonnet-4-6", max_tokens=2048,
                                     messages=[{"role": "user", "content": prompt}])
        match = re.search(r'\{.*\}', msg.content[0].text, re.DOTALL)
        briefing = json.loads(match.group()) if match else {}
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
        "briefing_date": date.today().isoformat(),
        "market_summary": briefing.get("market_summary", ""),
        "top_stocks": json.dumps(briefing.get("top_stocks", []), ensure_ascii=False),
        "sector_outlook": json.dumps(briefing.get("sector_outlook", []), ensure_ascii=False),
        "expert_consensus": briefing.get("expert_consensus", ""),
        "risk_alerts": json.dumps(briefing.get("risk_alerts", []), ensure_ascii=False),
        "investor_flow": json.dumps(investor_flow, ensure_ascii=False),
        "raw_data": json.dumps({"market": market}, ensure_ascii=False),
    })

    print(f"  브리핑 저장 완료")
    print(f"  요약: {briefing.get('market_summary', '')[:100]}...")


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


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else auto_detect_mode()
    print(f"{'='*50}")
    print(f"  Railway 통합 수집기 [{mode}]")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    if mode == "morning":
        collect_news()
        collect_youtube(collect_time="morning")
        generate_briefing()

    elif mode == "afternoon":
        collect_news()
        collect_youtube(collect_time="afternoon")
        generate_briefing()

    else:
        collect_news()
        collect_youtube()
        generate_briefing()

    print(f"\n{'='*50}")
    print(f"  완료! {datetime.now().strftime('%H:%M:%S')}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
