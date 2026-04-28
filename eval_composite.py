"""
복합 점수 유효성 검증 스크립트
실행: python eval_composite.py

측정 항목:
1. composite_score 구간별 평균 수익률 (포트폴리오 신호)
2. composite_score 구간별 예측 적중률 (prediction_log)
3. 채널별 기여도 (tech/ml/news/yt 각 점수 vs 실제 수익)
"""
import os, json, urllib.request
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def score_band(score):
    if score is None: return "데이터없음"
    if score >= 7.0: return "A (7+)"
    if score >= 5.5: return "B (5.5~7)"
    if score >= 4.0: return "C (4~5.5)"
    return "D (<4)"


def eval_portfolio_signals():
    """portfolio_signals: composite_score 구간별 수익률"""
    print("\n" + "="*55)
    print("  [1] 복합 점수 구간별 실제 수익률")
    print("="*55)

    rows = sb_get("portfolio_signals",
        "select=signal_date,stock_name,signal_score,return_pct,entry_price,current_price,status"
        "&order=signal_date.desc&limit=500")

    if not rows:
        print("  데이터 없음 (포트폴리오 신호가 아직 없습니다)")
        return

    bands = {}
    for r in rows:
        if r.get("return_pct") is None:
            continue
        band = score_band(r.get("signal_score"))
        if band not in bands:
            bands[band] = {"returns": [], "winners": 0, "count": 0}
        bands[band]["returns"].append(r["return_pct"])
        bands[band]["count"] += 1
        if r["return_pct"] > 0:
            bands[band]["winners"] += 1

    if not bands:
        print("  수익률 데이터 없음 (오후 업데이트 전이거나 데이터 부족)")
        return

    print(f"  {'등급':12} {'종목수':>6} {'승률':>8} {'평균수익':>10} {'최고':>8} {'최저':>8}")
    print("  " + "-"*53)
    for band in ["A (7+)", "B (5.5~7)", "C (4~5.5)", "D (<4)"]:
        if band not in bands:
            continue
        d = bands[band]
        rets = d["returns"]
        avg = sum(rets) / len(rets)
        win_rate = d["winners"] / d["count"] * 100
        print(f"  {band:12} {d['count']:>6}개  {win_rate:>6.1f}%  {avg:>+8.2f}%  {max(rets):>+6.2f}%  {min(rets):>+6.2f}%")

    # 전체 요약
    all_rets = [r["return_pct"] for r in rows if r.get("return_pct") is not None]
    if all_rets:
        print(f"\n  전체 {len(all_rets)}개 신호 | 평균 {sum(all_rets)/len(all_rets):+.2f}% | "
              f"승률 {sum(1 for r in all_rets if r > 0)/len(all_rets)*100:.1f}%")


def eval_prediction_accuracy():
    """prediction_log: composite_score 구간별 예측 적중률"""
    print("\n" + "="*55)
    print("  [2] 복합 점수 구간별 예측 적중률")
    print("="*55)

    rows = sb_get("prediction_log",
        "select=date,ticker,composite_score,tech_score,ml_score,news_score,yt_score,predicted_up,actual_up,correct"
        "&correct=not.is.null"
        "&order=date.desc&limit=500")

    if not rows:
        print("  적중률 데이터 없음 (actual_up이 아직 채워지지 않았습니다)")
        return

    bands = {}
    for r in rows:
        band = score_band(r.get("composite_score"))
        if band not in bands:
            bands[band] = {"total": 0, "correct": 0}
        bands[band]["total"] += 1
        if r.get("correct"):
            bands[band]["correct"] += 1

    print(f"  {'등급':12} {'총예측':>6} {'적중':>6} {'적중률':>8}")
    print("  " + "-"*35)
    for band in ["A (7+)", "B (5.5~7)", "C (4~5.5)", "D (<4)", "데이터없음"]:
        if band not in bands:
            continue
        d = bands[band]
        acc = d["correct"] / d["total"] * 100 if d["total"] else 0
        print(f"  {band:12} {d['total']:>6}개  {d['correct']:>5}개  {acc:>7.1f}%")

    total = sum(d["total"] for d in bands.values())
    correct = sum(d["correct"] for d in bands.values())
    print(f"\n  전체 {total}개 예측 | 적중률 {correct/total*100:.1f}%")


def eval_channel_contribution():
    """각 채널(tech/ml/news/yt) 점수와 실제 수익의 상관관계"""
    print("\n" + "="*55)
    print("  [3] 채널별 점수 기여도 분석")
    print("="*55)

    # prediction_log + portfolio_signals 조인
    signals = sb_get("portfolio_signals",
        "select=signal_date,ticker,signal_score,return_pct"
        "&return_pct=not.is.null&limit=200")

    if not signals:
        print("  데이터 부족 (수익률 있는 신호 없음)")
        return

    # signal_date + ticker 기준으로 prediction_log에서 점수 조회
    matched = []
    for s in signals:
        date = s["signal_date"]
        ticker = s["ticker"]
        try:
            log = sb_get("prediction_log",
                f"date=eq.{date}&ticker=eq.{ticker}"
                f"&select=tech_score,ml_score,news_score,yt_score,composite_score&limit=1")
            if log:
                matched.append({**s, **log[0]})
        except:
            pass

    if not matched:
        print("  prediction_log와 매칭되는 데이터 없음")
        return

    def avg_return_by_score(data, score_field, threshold):
        hi = [d["return_pct"] for d in data if (d.get(score_field) or 0) >= threshold]
        lo = [d["return_pct"] for d in data if (d.get(score_field) or 0) < threshold]
        hi_avg = sum(hi)/len(hi) if hi else 0
        lo_avg = sum(lo)/len(lo) if lo else 0
        return hi_avg, lo_avg, len(hi), len(lo)

    print(f"\n  기술점수 ≥4 vs <4:")
    h, l, nh, nl = avg_return_by_score(matched, "tech_score", 4.0)
    print(f"    높음({nh}개): {h:+.2f}%  |  낮음({nl}개): {l:+.2f}%  |  차이: {h-l:+.2f}%p")

    print(f"\n  ML점수 ≥1 vs <1:")
    h, l, nh, nl = avg_return_by_score(matched, "ml_score", 1.0)
    print(f"    높음({nh}개): {h:+.2f}%  |  낮음({nl}개): {l:+.2f}%  |  차이: {h-l:+.2f}%p")

    print(f"\n  뉴스점수 ≥0.5 vs <0.5:")
    h, l, nh, nl = avg_return_by_score(matched, "news_score", 0.5)
    print(f"    높음({nh}개): {h:+.2f}%  |  낮음({nl}개): {l:+.2f}%  |  차이: {h-l:+.2f}%p")

    print(f"\n  유튜브점수 ≥0.3 vs <0.3:")
    h, l, nh, nl = avg_return_by_score(matched, "yt_score", 0.3)
    print(f"    높음({nh}개): {h:+.2f}%  |  낮음({nl}개): {l:+.2f}%  |  차이: {h-l:+.2f}%p")

    print(f"\n  → 차이가 클수록 해당 채널이 실제 수익에 기여함")
    print(f"  → 차이가 0이거나 반대면 해당 채널 신호는 노이즈")


def main():
    print("\n" + "="*55)
    print("  복합 점수 유효성 검증")
    print(f"  기준일: {datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d %H:%M')}")
    print("="*55)
    print("\n  [해석 가이드]")
    print("  - A등급 수익 > B > C > D  → 점수 체계 유효")
    print("  - 차이 없거나 역전  → 해당 채널 재검토 필요")
    print("  - 적중률 55% 이상  → 통계적으로 의미 있음")

    eval_portfolio_signals()
    eval_prediction_accuracy()
    eval_channel_contribution()

    print("\n" + "="*55)
    print("  [다음 점검 시기]")
    print("  - 1주 후: 신호 10개 이상 쌓이면 [1][3] 의미 있어짐")
    print("  - 2주 후: [2] 적중률 통계 신뢰 가능")
    print("  - 1달 후: 채널별 가중치 재조정 근거 생김")
    print("="*55 + "\n")


if __name__ == "__main__":
    main()
