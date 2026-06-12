"""
KOSPI 과거 데이터를 yfinance로 가져와서 sector_index_history에 삽입.
sector_code='0001' (KOSPI) 기준, 최근 35거래일 (~7주).
MA20 계산에 최소 20일 필요.
"""
import os
import sys
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()

try:
    import yfinance as yf
except ImportError:
    print("yfinance 없음. pip install yfinance 후 재실행")
    sys.exit(1)

try:
    import supabase as sb_module
    from supabase import create_client
except ImportError:
    print("supabase 없음. pip install supabase 후 재실행")
    sys.exit(1)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("[KOSPI 히스토리 수집] yfinance로 ^KS11 35거래일 데이터 가져오는 중...")
ticker = yf.Ticker("^KS11")
df = ticker.history(period="60d")  # 여유 있게 60일 요청

if df.empty:
    print("오류: yfinance에서 데이터를 가져오지 못했습니다.")
    sys.exit(1)

df = df.tail(35)  # 최근 35거래일만 사용
print(f"  수집된 데이터: {len(df)}일 ({df.index[0].date()} ~ {df.index[-1].date()})")

rows = []
for dt, row in df.iterrows():
    rows.append({
        "sector_code": "0001",
        "trade_date":  dt.date().isoformat(),
        "open_index":  round(float(row["Open"]), 2),
        "high_index":  round(float(row["High"]), 2),
        "low_index":   round(float(row["Low"]), 2),
        "close_index": round(float(row["Close"]), 2),
        "volume":      int(row["Volume"]) if row["Volume"] else 0,
    })

print(f"[Supabase upsert] {len(rows)}건 삽입 중...")
try:
    result = (
        client.table("sector_index_history")
        .upsert(rows, on_conflict="sector_code,trade_date")
        .execute()
    )
    print(f"  완료: {len(result.data)}건 upserted")
except Exception as e:
    print(f"  오류: {e}")
    sys.exit(1)

# 확인 쿼리
check = (
    client.table("sector_index_history")
    .select("trade_date,close_index")
    .eq("sector_code", "0001")
    .order("trade_date", desc=True)
    .limit(5)
    .execute()
)
print("\n[검증] 최신 5건:")
for r in check.data:
    print(f"  {r['trade_date']}: {r['close_index']:,.2f}")

# MA20 계산 확인
all_rows = (
    client.table("sector_index_history")
    .select("trade_date,close_index")
    .eq("sector_code", "0001")
    .order("trade_date", desc=True)
    .limit(25)
    .execute()
)
closes = [r["close_index"] for r in all_rows.data if r.get("close_index")][::-1]
if len(closes) >= 20:
    ma20 = sum(closes[-20:]) / 20
    current = closes[-1]
    ratio = current / ma20
    print(f"\n[MA20 계산] KOSPI {current:,.2f} / MA20 {ma20:,.2f} (비율 {ratio:.3f})")
    if ratio > 1.02:
        print("  → BULL 지표 ✅ (MA20 2% 상회)")
    elif ratio >= 1.0:
        print("  → NEUTRAL (MA20 상회, 2% 미만)")
    else:
        print(f"  → BEAR 지표 (MA20 하회, {(ratio-1)*100:.1f}%)")
else:
    print(f"\n[MA20] 데이터 부족: {len(closes)}건 (20건 이상 필요)")
