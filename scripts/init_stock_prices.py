"""
KIS OHLCV 초기 적재 스크립트 (최초 1회 실행)
WATCH_STOCKS 전체 400일치 가격을 Supabase stock_prices에 저장

실행: python scripts/init_stock_prices.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from railway_job import collect_stock_prices

print("=" * 50)
print("KIS 가격 초기 적재 (400 거래일)")
print("약 2~3분 소요됩니다")
print("=" * 50)

collect_stock_prices(days=400)

print("\n초기 적재 완료!")
print("이후 railway_job.py morning이 매일 최신 5일치를 갱신합니다.")
