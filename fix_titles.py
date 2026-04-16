"""Supabase youtube_insights 테이블의 영어 제목을 한국어로 업데이트 (HTTP 직접 호출)"""
import os
import sys
import json
import yt_dlp
import urllib.request
from pathlib import Path
from dotenv import load_dotenv

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def supabase_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def supabase_update(table, video_id, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}?video_id=eq.{video_id}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=HEADERS, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        return resp.status


def get_korean_title(video_id: str) -> str | None:
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "extract_flat": True,
        "extractor_args": {"youtube": {"lang": ["ko"]}},
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get("title")
    except Exception as e:
        print(f"  실패 ({video_id}): {e}")
        return None


def is_english_title(title: str) -> bool:
    if not title:
        return False
    ascii_chars = sum(1 for c in title if ord(c) < 128)
    return (ascii_chars / len(title)) > 0.7


def main():
    rows = supabase_get("youtube_insights", "select=video_id,title")
    print(f"전체 {len(rows)}개 영상 확인")

    english_rows = [r for r in rows if is_english_title(r["title"])]
    print(f"영어 제목 {len(english_rows)}개 발견\n")

    if not english_rows:
        print("수정할 제목이 없습니다.")
        return

    updated = 0
    for i, row in enumerate(english_rows):
        vid = row["video_id"]
        old_title = row["title"]
        print(f"[{i+1}/{len(english_rows)}] {vid}")
        print(f"  영어: {old_title[:80]}")

        new_title = get_korean_title(vid)
        if not new_title or new_title == old_title:
            print(f"  스킵 (변경 없음)")
            continue

        supabase_update("youtube_insights", vid, {"title": new_title})
        print(f"  한국어: {new_title[:80]}")
        updated += 1

    print(f"\n완료: {updated}/{len(english_rows)}개 제목 업데이트")


if __name__ == "__main__":
    main()
