"""5/1 prediction_log actual_up + correct 업데이트
5/1은 근로자의 날(공휴일)이므로 전일(4/30) vs 익 거래일(5/4) 종가 비교 사용
"""
import os, json, re, urllib.request
from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# 5/1 예측 행 가져오기
url = SUPABASE_URL + "/rest/v1/prediction_log?date=eq.2026-05-01&select=ticker,predicted_up&limit=200"
req = urllib.request.Request(url, headers=HEADERS)
rows = json.loads(urllib.request.urlopen(req).read())
print(f"5/1 예측 행: {len(rows)}개")
print("5/1은 공휴일 → 4/30 종가 vs 5/4 종가 비교로 actual_up 산출")

updated = skipped = 0
for row in rows:
    ticker = row["ticker"]
    code = ticker.replace(".KS", "").replace(".KQ", "")
    try:
        naver_url = f"http://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count=15&requestType=0"
        raw = urllib.request.urlopen(naver_url, timeout=5).read().decode("euc-kr", "ignore")
        items = re.findall(r'data="([^"]+)"', raw)
        d_map = {}
        for item in items:
            parts = item.split("|")
            if len(parts) >= 5 and parts[4] != "0":
                d_map[parts[0]] = float(parts[4])
        # 4/30 전일 종가, 5/4 익거래일 종가
        c1 = d_map.get("20260430")
        c2 = d_map.get("20260504")
        if c1 and c2:
            actual_up = c2 > c1
            correct = row["predicted_up"] == actual_up
            patch_url = SUPABASE_URL + f"/rest/v1/prediction_log?date=eq.2026-05-01&ticker=eq.{ticker}"
            body = json.dumps({"actual_up": actual_up, "correct": correct}).encode()
            req2 = urllib.request.Request(patch_url, data=body, method="PATCH",
                headers={**HEADERS, "Prefer": "return=minimal"})
            urllib.request.urlopen(req2)
            updated += 1
        else:
            print(f"  {ticker}: 4/30={c1}, 5/4={c2} 데이터 없음")
            skipped += 1
    except Exception as e:
        print(f"  {ticker} 실패: {e}")
        skipped += 1

print(f"완료: {updated}개 업데이트, {skipped}개 스킵")
