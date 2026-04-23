"""
KRX 전체 상장 종목 → Supabase stock_master 저장
kind.krx.co.kr HTML 파싱 방식 (추가 패키지 불필요)

실행: python krx_fetcher.py
"""
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# KRX/KSIC 업종명 → 서비스 섹터 매핑 (우선순위 순서로 나열)
KRX_SECTOR_MAP = [
    # 반도체
    ("반도체",              "반도체"),
    ("전자부품",            "반도체"),
    ("전기전자",            "반도체"),
    ("전자 부품",           "반도체"),
    ("디스플레이",          "반도체"),
    ("인쇄회로",            "반도체"),
    # 바이오
    ("의약품",              "바이오"),
    ("의료",                "바이오"),
    ("바이오",              "바이오"),
    ("제약",                "바이오"),
    ("헬스케어",            "바이오"),
    ("병원",                "바이오"),
    ("의원",                "바이오"),
    ("생명과학",            "바이오"),
    ("진단",                "바이오"),
    # 자동차
    ("자동차",              "자동차"),
    ("트레일러",            "자동차"),
    ("운수장비",            "자동차"),
    # 조선
    ("조선",                "조선"),
    ("선박",                "조선"),
    # 방산
    ("방위",                "방산"),
    ("무기",                "방산"),
    # 우주항공
    ("항공우주",            "우주항공"),
    ("항공기",              "우주항공"),
    ("위성",                "우주항공"),
    # 원자력
    ("원자력",              "원자력"),
    ("원자로",              "원자력"),
    # 2차전지/에너지
    ("2차전지",             "2차전지/에너지"),
    ("배터리",              "2차전지/에너지"),
    ("태양광",              "2차전지/에너지"),
    ("신재생",              "2차전지/에너지"),
    ("전기 생산",           "2차전지/에너지"),
    ("전기가스",            "2차전지/에너지"),
    ("에너지",              "2차전지/에너지"),
    # IT/플랫폼
    ("통신",                "IT/플랫폼"),
    ("소프트웨어",          "IT/플랫폼"),
    ("컴퓨터 프로그래밍",   "IT/플랫폼"),
    ("컴퓨터",              "IT/플랫폼"),
    ("IT서비스",            "IT/플랫폼"),
    ("정보처리",            "IT/플랫폼"),
    ("데이터",              "IT/플랫폼"),
    ("인터넷",              "IT/플랫폼"),
    ("게임",                "IT/플랫폼"),
    ("방송",                "IT/플랫폼"),
    ("영화",                "IT/플랫폼"),
    ("콘텐츠",              "IT/플랫폼"),
    ("출판",                "IT/플랫폼"),
    ("광고",                "IT/플랫폼"),
    ("서비스업",            "IT/플랫폼"),
    # 금융
    ("은행",                "금융"),
    ("증권",                "금융"),
    ("보험",                "금융"),
    ("금융",                "금융"),
    ("자산운용",            "금융"),
    ("신용",                "금융"),
    ("캐피탈",              "금융"),
    # 건설
    ("건설",                "건설"),
    ("부동산",              "건설"),
    ("토목",                "건설"),
    # 소재/산업재 (후순위로 폭넓게)
    ("화학",                "소재/산업재"),
    ("플라스틱",            "소재/산업재"),
    ("고무",                "소재/산업재"),
    ("철강",                "소재/산업재"),
    ("금속",                "소재/산업재"),
    ("기계",                "소재/산업재"),
    ("비금속",              "소재/산업재"),
    ("광물",                "소재/산업재"),
    ("음식료",              "소재/산업재"),
    ("식품",                "소재/산업재"),
    ("음료",                "소재/산업재"),
    ("담배",                "소재/산업재"),
    ("농업",                "소재/산업재"),
    ("어업",                "소재/산업재"),
    ("임업",                "소재/산업재"),
    ("목재",                "소재/산업재"),
    ("종이",                "소재/산업재"),
    ("인쇄",                "소재/산업재"),
    ("섬유",                "소재/산업재"),
    ("의복",                "소재/산업재"),
    ("가죽",                "소재/산업재"),
    ("신발",                "소재/산업재"),
    ("가구",                "소재/산업재"),
    ("유통",                "소재/산업재"),
    ("도매",                "소재/산업재"),
    ("소매",                "소재/산업재"),
    ("운수",                "소재/산업재"),
    ("창고",                "소재/산업재"),
    ("물류",                "소재/산업재"),
    ("숙박",                "소재/산업재"),
    ("음식점",              "소재/산업재"),
    ("세탁",                "소재/산업재"),
    ("환경",                "소재/산업재"),
    ("폐기물",              "소재/산업재"),
    ("광업",                "소재/산업재"),
    ("채굴",                "소재/산업재"),
    ("제조",                "소재/산업재"),  # 마지막 catch-all
]

def krx_to_sector(krx_sector: str) -> str:
    s = str(krx_sector)
    for keyword, sector in KRX_SECTOR_MAP:
        if keyword in s:
            return sector
    return "기타"


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.current_row, self.current_cell, self.in_td = [], [], "", False

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.current_row = []
        elif tag in ("td", "th"):
            self.in_td = True
            self.current_cell = ""

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            self.current_row.append(self.current_cell.strip())
            self.in_td = False
        elif tag == "tr" and self.current_row:
            self.rows.append(self.current_row)

    def handle_data(self, data):
        if self.in_td:
            self.current_cell += data


def fetch_market(search_type: str, market: str, suffix: str) -> list:
    url = "https://kind.krx.co.kr/corpgeneral/corpList.do"
    data = urllib.parse.urlencode({
        "method": "download",
        "searchType": search_type,
    }).encode("utf-8")

    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": "https://kind.krx.co.kr/",
        }
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("euc-kr", errors="replace")

    parser = TableParser()
    parser.feed(html)

    rows = []
    for row in parser.rows[1:]:  # 첫 행은 헤더
        if len(row) < 4:
            continue
        name = row[0].strip()
        raw_code = row[2].strip().replace(" ", "")
        krx_sector = row[3].strip() if len(row) > 3 else ""

        # 보통주만: 6자리 숫자 코드
        if not raw_code.isdigit() or len(raw_code) != 6:
            continue
        if not name:
            continue

        rows.append({
            "ticker": raw_code + suffix,
            "name": name,
            "market": market,
            "market_cap": 0,
            "sector": krx_to_sector(krx_sector),
            "krx_sector": krx_sector,
            "updated_at": datetime.now().isoformat(),
        })

    return rows


def save_to_supabase(rows: list):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("오류: SUPABASE_URL / SUPABASE_KEY 환경변수 없음")
        sys.exit(1)

    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Supabase 연결 실패: {e}")
        sys.exit(1)

    saved = 0
    for i in range(0, len(rows), 50):
        batch = rows[i:i+50]
        try:
            sb.table("stock_master").upsert(batch, on_conflict="ticker").execute()
            saved += len(batch)
        except Exception as e:
            print(f"  배치 오류 ({i}): {e}")

    print(f"완료: {saved}개 저장")


if __name__ == "__main__":
    print("=" * 50)
    print("  KRX 종목 데이터 수집")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    all_rows = []

    # KOSPI: searchType=13, KOSDAQ: searchType=14
    for search_type, market, suffix in [("13", "KOSPI", ".KS"), ("14", "KOSDAQ", ".KQ")]:
        print(f"\n{market} 수집 중...")
        try:
            rows = fetch_market(search_type, market, suffix)
            print(f"  {len(rows)}개 수집")
            all_rows.extend(rows)
        except Exception as e:
            print(f"  오류: {e}")

    if not all_rows:
        print("\n수집 실패")
        sys.exit(1)

    from collections import Counter
    print(f"\n총 {len(all_rows)}개 | 섹터 분포:")
    for sector, cnt in sorted(Counter(r["sector"] for r in all_rows).items(), key=lambda x: -x[1]):
        print(f"  {sector}: {cnt}개")

    print("\nSupabase 저장 중...")
    save_to_supabase(all_rows)
