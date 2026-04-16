"""
뉴스/공시/수급 수집기
① 네이버 금융 뉴스 (종목별)
② KRX 외국인/기관 매매 동향
③ Claude로 뉴스 요약 + 호재/악재 판단
"""
import os
import sys
import json
import re
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

load_dotenv(Path(__file__).parent / ".env")

# Supabase HTTP
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# 종목코드 → 6자리 숫자
def ticker_to_code(ticker: str) -> str:
    """005930.KS → 005930"""
    return ticker.split(".")[0]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ① 네이버 금융 뉴스
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def fetch_naver_news(stock_code: str, max_pages: int = 2) -> list:
    """
    네이버 금융 종목 뉴스 수집 (모바일 API)
    stock_code: 6자리 (예: '005930')
    """
    articles = []
    headers = {"User-Agent": "Mozilla/5.0"}

    for page in range(1, max_pages + 1):
        url = (
            f"https://m.stock.naver.com/api/news/stock/{stock_code}"
            f"?pageSize=15&page={page}"
        )
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  네이버 뉴스 수집 실패 (page {page}): {e}")
            continue

        # API 응답: list of clusters, 각 cluster에 items[]
        clusters = data if isinstance(data, list) else [data]
        for cluster in clusters:
            for item in cluster.get("items", []):
                dt = item.get("datetime", "")
                date_fmt = f"{dt[:4]}.{dt[4:6]}.{dt[6:8]}" if len(dt) >= 8 else dt
                office_id = item.get("officeId", "")
                article_id = item.get("articleId", "")
                article = {
                    "title": item.get("title", "").replace("&quot;", '"'),
                    "url": f"https://n.news.naver.com/mnews/article/{office_id}/{article_id}",
                    "date": date_fmt,
                    "source": item.get("officeName", ""),
                }
                articles.append(article)

        time.sleep(0.5)

    return articles


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ② KRX 외국인/기관 수급
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def fetch_investor_trading(stock_code: str, days: int = 10) -> list:
    """
    네이버 금융에서 외국인/기관 매매 동향 수집
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    url = (
        f"https://finance.naver.com/item/frgn.naver"
        f"?code={stock_code}&page=1"
    )
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("euc-kr", errors="replace")
    except Exception as e:
        print(f"  수급 데이터 수집 실패: {e}")
        return []

    # 테이블에서 날짜, 외국인 순매수, 기관 순매수 추출
    # 네이버 금융 외국인 탭 HTML 파싱
    results = []
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)

    for row in rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
        if len(cells) < 9:
            continue

        date_match = re.search(r'(\d{4}\.\d{2}\.\d{2})', cells[0])
        if not date_match:
            continue

        date = date_match.group(1)

        # 숫자 추출 헬퍼
        def parse_num(text):
            text = re.sub(r'<[^>]+>', '', text).strip()
            text = text.replace(",", "").replace("+", "")
            try:
                return int(text)
            except ValueError:
                return 0

        close = parse_num(cells[1])
        foreign_net = parse_num(cells[5])  # 외국인 순매수
        institution_net = parse_num(cells[6])  # 기관 순매수

        results.append({
            "date": date,
            "close": close,
            "foreign_net": foreign_net,
            "institution_net": institution_net,
        })

        if len(results) >= days:
            break

    return results


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ③ Claude 뉴스 분석
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def analyze_news_with_claude(stock_name: str, articles: list) -> dict:
    """뉴스 목록을 Claude로 분석: 요약 + 호재/악재 판단"""
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or len(articles) == 0:
        return {"summary": "분석 불가", "sentiment": "중립", "key_points": []}

    client = anthropic.Anthropic(api_key=api_key)

    news_text = "\n".join([
        f"- [{a['date']}] {a['title']} ({a['source']})"
        for a in articles[:15]
    ])

    prompt = f"""당신은 한국 주식 시장 전문 애널리스트입니다.
아래는 '{stock_name}' 관련 최근 뉴스 제목 목록입니다.

{news_text}

다음을 JSON으로 작성해주세요:
1. summary: 전체 뉴스 흐름 3줄 요약
2. sentiment: 종합 판단 ("호재"/"중립"/"악재" 중 하나)
3. key_points: 핵심 포인트 3~5개 리스트 (각 1줄)
4. risk_factors: 리스크 요인 1~3개 리스트
5. catalysts: 주가 상승 촉매 1~3개 리스트

JSON만 출력하세요."""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        content = message.content[0].text
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        print(f"  Claude 분석 실패: {e}")

    return {"summary": "분석 실패", "sentiment": "중립", "key_points": []}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Supabase 저장
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def save_news_to_supabase(stock_code: str, stock_name: str,
                          articles: list, analysis: dict,
                          investor_data: list) -> bool:
    """뉴스 분석 결과를 Supabase에 저장"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False

    row = {
        "stock_code": stock_code,
        "stock_name": stock_name,
        "collected_at": datetime.now().isoformat(),
        "articles": json.dumps(articles[:10], ensure_ascii=False),
        "analysis": json.dumps(analysis, ensure_ascii=False),
        "investor_data": json.dumps(investor_data[:10], ensure_ascii=False),
        "sentiment": analysis.get("sentiment", "중립"),
    }

    try:
        url = f"{SUPABASE_URL}/rest/v1/stock_news"
        body = json.dumps(row).encode("utf-8")
        headers = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        urllib.request.urlopen(req)
        return True
    except Exception as e:
        print(f"  Supabase 저장 실패: {e}")
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 메인 실행
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WATCH_STOCKS = {
    "삼성전자": "005930",
    "SK하이닉스": "000660",
    "현대차": "005380",
    "NAVER": "035420",
    "카카오": "035720",
    "LG에너지솔루션": "373220",
    "셀트리온": "068270",
    "기아": "000270",
    "KB금융": "105560",
    "한미반도체": "042700",
}


def collect_stock_news(stock_name: str, stock_code: str):
    """단일 종목 뉴스 + 수급 수집"""
    print(f"\n[{stock_name}] ({stock_code})")

    # 뉴스 수집
    print("  뉴스 수집 중...")
    articles = fetch_naver_news(stock_code, max_pages=2)
    print(f"  → {len(articles)}개 기사")

    # 수급 데이터
    print("  수급 데이터 수집 중...")
    investor = fetch_investor_trading(stock_code, days=10)
    if investor:
        foreign_sum = sum(d["foreign_net"] for d in investor[:5])
        inst_sum = sum(d["institution_net"] for d in investor[:5])
        print(f"  → 외국인 5일 순매수: {foreign_sum:+,}주 | 기관 5일 순매수: {inst_sum:+,}주")
    else:
        print("  → 수급 데이터 없음")

    # Claude 분석
    if articles:
        print("  Claude 분석 중...")
        analysis = analyze_news_with_claude(stock_name, articles)
        print(f"  → 감성: {analysis.get('sentiment', '?')}")
        print(f"  → 요약: {analysis.get('summary', '-')[:80]}")
    else:
        analysis = {"summary": "뉴스 없음", "sentiment": "중립", "key_points": []}

    # 저장
    sb_ok = save_news_to_supabase(stock_code, stock_name, articles, analysis, investor)
    print(f"  Supabase: {'OK' if sb_ok else 'SKIP'}")

    return {
        "stock_name": stock_name,
        "stock_code": stock_code,
        "articles": articles,
        "analysis": analysis,
        "investor_data": investor,
    }


def collect_all():
    """전체 관심 종목 수집"""
    print("=" * 50)
    print(f"  뉴스/수급 수집 시작")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    results = []
    for name, code in WATCH_STOCKS.items():
        result = collect_stock_news(name, code)
        results.append(result)
        time.sleep(1)

    print(f"\n수집 완료: {len(results)}개 종목")
    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="뉴스/수급 수집기")
    parser.add_argument("stock", nargs="?", help="종목명 (예: 삼성전자)")
    args = parser.parse_args()

    if args.stock:
        code = WATCH_STOCKS.get(args.stock)
        if code:
            collect_stock_news(args.stock, code)
        else:
            print(f"'{args.stock}'를 WATCH_STOCKS에서 찾을 수 없습니다.")
            print(f"등록된 종목: {', '.join(WATCH_STOCKS.keys())}")
    else:
        collect_all()
