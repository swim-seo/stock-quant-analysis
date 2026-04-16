"""로컬 youtube_insights/*.json → Supabase 일괄 업로드 (httpx 직접 호출)"""
import json
import sys
import os
from pathlib import Path
from dotenv import load_dotenv
import httpx

load_dotenv(Path(__file__).parent / ".env")

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()
TABLE = "youtube_insights"
INSIGHTS_DIR = Path("youtube_insights")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


def upload_file(filepath: Path, client: httpx.Client) -> bool:
    data = json.loads(filepath.read_text(encoding="utf-8"))
    insight = data.get("insight", {})

    row = {
        "video_id": data.get("video_id", ""),
        "title": data.get("title", ""),
        "channel": data.get("channel", ""),
        "url": data.get("url", ""),
        "upload_date": data.get("upload_date"),
        "processed_at": data.get("processed_at"),
        "summary": insight.get("summary", ""),
        "market_sentiment": insight.get("market_sentiment", "중립"),
        "key_stocks": insight.get("key_stocks", []),
        "key_sectors": insight.get("key_sectors", []),
        "keywords": insight.get("keywords", []),
        "investment_signals": json.dumps(insight.get("investment_signals", []), ensure_ascii=False),
        "risk_factors": json.dumps(insight.get("risk_factors", []), ensure_ascii=False),
        "trading_type": insight.get("trading_type", "스윙"),
        "urgency": insight.get("urgency", "이번주"),
    }

    resp = client.post(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=headers,
        json=row,
    )

    if resp.status_code in (200, 201):
        return True
    else:
        print(f"  FAIL [{resp.status_code}]: {data.get('title','')[:40]} - {resp.text[:100]}")
        return False


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("SUPABASE_URL / SUPABASE_KEY 환경변수 없음")
        return

    files = sorted(INSIGHTS_DIR.glob("*.json"))
    print(f"업로드 대상: {len(files)}개 파일")

    ok, fail = 0, 0
    with httpx.Client(timeout=30) as client:
        for i, f in enumerate(files):
            if upload_file(f, client):
                ok += 1
            else:
                fail += 1
            if (i + 1) % 10 == 0:
                print(f"  진행: {i+1}/{len(files)} (성공: {ok}, 실패: {fail})")

    print(f"\n완료: 성공 {ok}개 / 실패 {fail}개 / 전체 {len(files)}개")


if __name__ == "__main__":
    main()
