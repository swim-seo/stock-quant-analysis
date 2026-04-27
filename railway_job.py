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

    prompt = f"""한국 주식 시장 전문 애널리스트로서 오늘({today_kst()}) 아침 브리핑을 작성하세요.

시장: {market_text}
유튜브: {yt_text}
종목 뉴스: {news_text}

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


def save_predictions():
    """오전 수집 후 오늘 예측 저장 + 어제 결과 업데이트"""
    print("\n[예측 로그 저장]")
    try:
        import yfinance as yf
    except ImportError:
        print("  yfinance 없음, 스킵")
        return

    today = today_kst().isoformat()
    yesterday = (today_kst() - timedelta(days=1)).isoformat()

    for name, code in WATCH_STOCKS.items():
        ticker_sym = f"{code}.KS" if int(code) >= 200000 or len(code) == 6 and code[0] in "0123456789" else f"{code}.KQ"
        # 코스피/코스닥 구분은 단순하게: 6자리 코드 중 일부 코스닥은 .KQ
        # 간단히: 000-099 코스닥, 100+ 혼재 → KS로 기본, 실패시 KQ
        try:
            closes = []
            for suffix in [".KS", ".KQ"]:
                hist = yf.Ticker(f"{code}{suffix}").history(period="3mo")
                if not hist.empty:
                    closes = hist["Close"].tolist()
                    ticker_sym = f"{code}{suffix}"
                    break
            if len(closes) < 21:
                continue

            prob = _prediction_score(closes)
            predicted_up = prob >= 0.5

            # 오늘 예측 저장
            sb_post("prediction_log", {
                "date": today,
                "ticker": ticker_sym,
                "predicted_up": predicted_up,
                "probability": round(prob, 4),
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
        _run_theme_scanner()

    elif mode == "afternoon":
        collect_news()
        collect_youtube(collect_time="afternoon")
        generate_briefing()

    else:
        collect_news()
        collect_youtube()
        generate_briefing()
        _run_theme_scanner()

    print(f"\n{'='*50}")
    print(f"  완료! {now_kst().strftime('%H:%M:%S')}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
