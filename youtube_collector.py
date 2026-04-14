import os
import json
import schedule
import time
from datetime import datetime
from pathlib import Path
from youtube_transcript_api import YouTubeTranscriptApi
import yt_dlp
import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


# 분석할 유튜브 채널 목록 (채널ID 또는 핸들)
# 원하는 채널 추가하면 됨
CHANNELS = {
    "한국경제TV": "@hkwowtv",
    "매일경제TV": "@MKeconomy_TV",
}

# 저장 경로
DATA_DIR = Path("youtube_data")
INSIGHTS_DIR = Path("youtube_insights")
DATA_DIR.mkdir(exist_ok=True)
INSIGHTS_DIR.mkdir(exist_ok=True)


STOCK_KEYWORDS = [
    # 한국어
    "주식", "코스피", "코스닥", "증시", "주가", "투자", "매수", "매도",
    "반도체", "배당", "ETF", "펀드", "금리", "환율", "경제", "시장",
    "상승", "하락", "급등", "급락", "포트폴리오", "종목", "실적",
    "증권", "자산", "채권", "선물", "옵션", "리밸런싱", "수익률",
    # 영어
    "stock", "KOSPI", "market", "invest", "ETF", "semiconductor",
    "bull", "bear", "rally", "rebound", "FOMC", "rate",
]


def is_stock_related(title: str) -> bool:
    """제목에 주식/경제 관련 키워드가 있는지 확인"""
    title_lower = title.lower()
    return any(kw.lower() in title_lower for kw in STOCK_KEYWORDS)


def get_channel_videos(channel_id: str, max_videos: int = 50, stock_only: bool = True) -> list:
    """채널에서 최신 영상 목록 가져오기 (주식 관련만 필터링)"""
    # 핸들(@) 또는 채널 ID 모두 지원
    if channel_id.startswith("@"):
        url = f"https://www.youtube.com/{channel_id}/videos"
    else:
        url = f"https://www.youtube.com/channel/{channel_id}/videos"
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
        "playlist_items": f"1:{max_videos}",
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        videos = []
        for entry in info.get("entries", []):
            title = entry.get("title", "")
            if stock_only and not is_stock_related(title):
                continue
            videos.append({
                "id": entry.get("id"),
                "title": title,
                "url": f"https://www.youtube.com/watch?v={entry.get('id')}",
                "upload_date": entry.get("upload_date"),
            })
        return videos


def get_transcript(video_id: str) -> str:
    """
    영상 스크립트 가져오기
    - 한국어 자막 우선, 없으면 자동생성 자막
    - 타임스탬프 + 텍스트 형태로 반환
    - 자막 없는 영상은 None 반환

    반환 형식:
        [00:00] 안녕하세요 오늘은 코스피 시장을 분석해보겠습니다
        [00:05] 최근 반도체 업종이 강세를 보이고 있는데요
        ...
    """
    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)

        # 한국어 우선, 없으면 첫 번째 자막
        try:
            transcript = transcript_list.find_transcript(["ko", "ko-KR"])
        except Exception:
            transcript = list(transcript_list)[0]

        fetched = transcript.fetch()

        # 타임스탬프 + 텍스트 결합
        lines = []
        for t in fetched:
            seconds = int(t.start)
            timestamp = f"[{seconds // 60:02d}:{seconds % 60:02d}]"
            lines.append(f"{timestamp} {t.text}")

        return "\n".join(lines)

    except Exception:
        return None


def is_already_processed(video_id: str) -> bool:
    """이미 처리된 영상인지 확인"""
    insight_file = INSIGHTS_DIR / f"{video_id}.json"
    return insight_file.exists()


def analyze_with_claude(title: str, transcript: str, channel: str) -> dict:
    """
    Claude API로 투자 인사이트 추출
    """
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    prompt = f"""당신은 주식/투자 전문 분석가입니다.
아래는 '{channel}' 채널의 '{title}' 영상 스크립트입니다.

스크립트:
{transcript[:8000]}  # 토큰 제한으로 앞부분만 사용

다음 항목을 JSON 형식으로 추출해주세요:

1. summary: 영상 핵심 내용 3줄 요약
2. market_sentiment: 시장 전망 (긍정/중립/부정)
3. key_stocks: 언급된 주요 종목 리스트 (있으면)
4. key_sectors: 언급된 주요 섹터/업종 리스트
5. investment_signals: 매수/매도/관망 관련 언급 내용
6. risk_factors: 언급된 리스크 요인
7. keywords: 핵심 키워드 5개

JSON만 출력하세요."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    try:
        content = message.content[0].text
        # JSON 파싱
        import re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception:
        pass

    return {"summary": "파싱 실패", "market_sentiment": "중립"}


def process_channel(channel_name: str, channel_id: str):
    """채널 최신 영상 수집 + 분석"""
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] {channel_name} 채널 수집 중...")

    videos = get_channel_videos(channel_id, max_videos=50)
    if not videos:
        print(f"  주식 관련 영상 없음")
        return

    print(f"  주식 관련 영상 {len(videos)}개 발견")
    for video in videos[:5]:  # 최대 5개만 처리
        video_id = video["id"]
        title = video["title"]

        if is_already_processed(video_id):
            print(f"  이미 처리됨: {title[:30]}...")
            continue

        print(f"  처리 중: {title[:40]}...")

        # 자막 수집
        transcript = get_transcript(video_id)
        if not transcript:
            print(f"  자막 없음, 스킵")
            continue

        # 자막 저장
        transcript_file = DATA_DIR / f"{video_id}.txt"
        transcript_file.write_text(transcript, encoding="utf-8")

        # Claude로 분석
        if os.environ.get("ANTHROPIC_API_KEY"):
            insight = analyze_with_claude(title, transcript, channel_name)
        else:
            insight = {"summary": "API 키 없음", "market_sentiment": "중립"}

        # 인사이트 저장
        result = {
            "video_id": video_id,
            "title": title,
            "channel": channel_name,
            "url": video["url"],
            "upload_date": video.get("upload_date"),
            "processed_at": datetime.now().isoformat(),
            "transcript_length": len(transcript),
            "insight": insight,
        }

        insight_file = INSIGHTS_DIR / f"{video_id}.json"
        insight_file.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        print(f"  완료: {title[:40]}")
        print(f"  시장전망: {insight.get('market_sentiment', '-')}")
        print(f"  요약: {insight.get('summary', '-')[:80]}...")


def get_latest_insights(n: int = 10) -> list:
    """최근 분석된 인사이트 가져오기"""
    files = sorted(INSIGHTS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True)
    insights = []
    for f in files[:n]:
        data = json.loads(f.read_text(encoding="utf-8"))
        insights.append(data)
    return insights


def get_market_sentiment_score() -> dict:
    """
    최근 인사이트들의 시장 심리 점수 집계
    → ML 모델 피처로 활용 가능
    """
    insights = get_latest_insights(20)
    if not insights:
        return {"score": 0, "label": "중립", "count": 0}

    sentiment_map = {"긍정": 1, "중립": 0, "부정": -1}
    scores = []
    for item in insights:
        s = item.get("insight", {}).get("market_sentiment", "중립")
        scores.append(sentiment_map.get(s, 0))

    avg = sum(scores) / len(scores)
    label = "긍정" if avg > 0.2 else "부정" if avg < -0.2 else "중립"

    return {
        "score": round(avg, 2),
        "label": label,
        "count": len(scores),
        "details": {
            "긍정": scores.count(1),
            "중립": scores.count(0),
            "부정": scores.count(-1),
        }
    }


def run_collection():
    """전체 채널 수집 실행"""
    print(f"\n{'='*50}")
    print(f"  유튜브 인사이트 수집 시작")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    for channel_name, channel_id in CHANNELS.items():
        try:
            process_channel(channel_name, channel_id)
        except Exception as e:
            print(f"  {channel_name} 오류: {e}")

    # 시장 심리 요약
    sentiment = get_market_sentiment_score()
    print(f"\n시장 심리 점수: {sentiment['score']} ({sentiment['label']})")
    print(f"분석 영상 수: {sentiment['count']}개")


def start_scheduler(interval_hours: int = 6):
    """주기적 자동 수집 스케줄러"""
    print(f"스케줄러 시작: {interval_hours}시간마다 수집")
    run_collection()  # 시작 시 즉시 1회 실행

    schedule.every(interval_hours).hours.do(run_collection)
    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "schedule":
        # 스케줄 모드: python youtube_collector.py schedule
        start_scheduler(interval_hours=6)
    else:
        # 1회 실행 모드
        run_collection()

        print("\n\n=== 최근 인사이트 요약 ===")
        insights = get_latest_insights(3)
        for item in insights:
            print(f"\n제목: {item['title'][:50]}")
            print(f"채널: {item['channel']}")
            print(f"시장전망: {item['insight'].get('market_sentiment', '-')}")
            print(f"요약: {item['insight'].get('summary', '-')}")
