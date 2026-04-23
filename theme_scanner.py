"""
theme_scanner.py — 경제 뉴스 헤드라인 → Claude 복수 테마 추출 → Supabase 저장

RSS 소스: 네이버 경제, 연합뉴스 경제, 한국경제
"""
import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime
from xml.etree import ElementTree as ET
from dotenv import load_dotenv
import anthropic

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

SB_HEADERS = {
    "apikey": SUPABASE_KEY or "",
    "Authorization": f"Bearer {SUPABASE_KEY or ''}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

RSS_SOURCES = [
    ("네이버경제", "https://news.naver.com/rss/section/101.xml"),
    ("연합뉴스", "https://www.yna.co.kr/rss/economy.xml"),
    ("한국경제", "https://www.hankyung.com/feed/all-news"),
    ("매일경제", "https://www.mk.co.kr/rss/30000001/"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}


def fetch_rss_headlines(name: str, url: str, max_items: int = 25) -> list[str]:
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            xml = resp.read()
        root = ET.fromstring(xml)
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        headlines = []
        # RSS 2.0
        for item in root.findall(".//item"):
            title = item.findtext("title", "").strip()
            if title:
                headlines.append(title)
        # Atom
        if not headlines:
            for entry in root.findall(".//atom:entry", ns):
                title = entry.findtext("atom:title", "", ns).strip()
                if title:
                    headlines.append(title)

        headlines = headlines[:max_items]
        print(f"  [{name}] {len(headlines)}개 헤드라인")
        return headlines
    except Exception as e:
        print(f"  [{name}] 수집 실패: {e}", file=sys.stderr)
        return []


def collect_all_headlines() -> list[str]:
    all_headlines = []
    seen = set()
    for name, url in RSS_SOURCES:
        for h in fetch_rss_headlines(name, url):
            if h not in seen:
                seen.add(h)
                all_headlines.append(h)
    return all_headlines


def extract_themes_with_claude(headlines: list[str]) -> list[dict]:
    if not headlines:
        return []

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    headline_text = "\n".join(f"- {h}" for h in headlines)

    prompt = f"""다음은 오늘 수집된 한국 경제 뉴스 헤드라인 {len(headlines)}개입니다.

{headline_text}

이 헤드라인들에서 오늘 주식시장에서 주목할 만한 투자 테마를 최대 7개 추출해주세요.

조건:
- 반도체/2차전지처럼 항상 있는 테마보다 **오늘 새롭게 또는 갑자기 부각되는 테마** 우선
- 테마마다 관련 가능성 있는 한국 상장사 종목명을 최대한 구체적으로 리스트업
- urgency: "오늘" (즉각적 이슈), "이번주" (단기 주목), "중장기" (트렌드)

각 테마를 다음 JSON 형식으로 출력:
[
  {{
    "theme_name": "테마명 (짧게)",
    "keywords": ["키워드1", "키워드2"],
    "related_stocks": ["종목명1", "종목명2"],
    "reason": "왜 오늘 주목받는지 1~2줄",
    "urgency": "오늘|이번주|중장기",
    "source_headlines": ["관련 헤드라인1", "관련 헤드라인2"]
  }}
]

JSON 배열만 출력하세요."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": "["},
        ],
    )

    try:
        content = "[" + message.content[0].text
        start = content.find("[")
        if start == -1:
            return []
        depth = 0
        in_string = False
        escape_next = False
        for i in range(start, len(content)):
            ch = content[i]
            if escape_next:
                escape_next = False
                continue
            if ch == "\\" and in_string:
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    themes = json.loads(content[start : i + 1])
                    return themes if isinstance(themes, list) else []
    except Exception as e:
        print(f"  [WARN] 테마 파싱 실패: {e}", file=sys.stderr)
    return []


def save_themes_to_supabase(themes: list[dict], scanned_at: str) -> bool:
    if not SUPABASE_URL or not SUPABASE_KEY or not themes:
        return False
    rows = [
        {
            "scanned_at": scanned_at,
            "theme_name": t.get("theme_name", ""),
            "keywords": t.get("keywords", []),
            "related_stocks": t.get("related_stocks", []),
            "reason": t.get("reason", ""),
            "urgency": t.get("urgency", "이번주"),
            "source_headlines": t.get("source_headlines", []),
        }
        for t in themes
        if t.get("theme_name")
    ]
    try:
        url = f"{SUPABASE_URL}/rest/v1/theme_signals"
        body = json.dumps(rows).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers=SB_HEADERS, method="POST")
        urllib.request.urlopen(req)
        print(f"  Supabase 저장 완료: {len(rows)}개 테마")
        return True
    except Exception as e:
        print(f"  Supabase 저장 실패: {e}", file=sys.stderr)
        return False


def run():
    print("\n=== 테마 스캐너 시작 ===")
    scanned_at = datetime.now().isoformat()

    print("헤드라인 수집 중...")
    headlines = collect_all_headlines()
    print(f"총 {len(headlines)}개 헤드라인 수집")

    if not headlines:
        print("헤드라인 없음, 종료")
        return

    print("Claude 테마 분석 중...")
    themes = extract_themes_with_claude(headlines)
    print(f"추출된 테마: {len(themes)}개")

    for i, t in enumerate(themes, 1):
        urgency_icon = "🔴" if t.get("urgency") == "오늘" else "🟡" if t.get("urgency") == "이번주" else "🔵"
        print(f"  {i}. {urgency_icon} {t.get('theme_name')} — {', '.join(t.get('related_stocks', [])[:3])}")

    save_themes_to_supabase(themes, scanned_at)
    print("=== 테마 스캐너 완료 ===\n")


if __name__ == "__main__":
    run()
