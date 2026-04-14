import pandas as pd
import numpy as np
from xgboost import XGBClassifier
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import StandardScaler
from data_collector import get_stock_data
from indicators import add_all_indicators
from multi_timeframe import add_mtf_signal
from backtester import Backtester, print_result


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    ML 피처 생성
    - 기술 지표 원값
    - 변화율 (전일 대비)
    - 과거 n일 수익률
    """
    df = df.copy()

    # 수익률
    df["return_1d"] = df["종가"].pct_change(1)
    df["return_3d"] = df["종가"].pct_change(3)
    df["return_5d"] = df["종가"].pct_change(5)
    df["return_10d"] = df["종가"].pct_change(10)
    df["return_20d"] = df["종가"].pct_change(20)

    # 거래량 변화율
    df["volume_change"] = df["거래량"].pct_change(1)
    df["volume_ma5"] = df["거래량"].rolling(5).mean()
    df["volume_ratio"] = df["거래량"] / df["volume_ma5"]  # 거래량 급증 여부

    # 이동평균 대비 현재가 위치
    df["price_to_ma5"] = df["종가"] / df["MA5"] - 1
    df["price_to_ma20"] = df["종가"] / df["MA20"] - 1
    df["price_to_ma60"] = df["종가"] / df["MA60"] - 1

    # 볼린저밴드 위치 (0=하단, 1=상단)
    df["bb_position"] = (df["종가"] - df["BB_lower"]) / (df["BB_upper"] - df["BB_lower"])

    # MACD 히스토그램 방향
    df["macd_hist_change"] = df["MACD_hist"].diff()

    # 고가/저가 대비 종가 위치 (당일 캔들 강도)
    df["candle_strength"] = (df["종가"] - df["저가"]) / (df["고가"] - df["저가"] + 1e-9)

    # 타겟: 다음날 종가가 오늘보다 높으면 1 (상승), 낮으면 0 (하락)
    df["target"] = (df["종가"].shift(-1) > df["종가"]).astype(int)

    return df


FEATURE_COLS = [
    "RSI", "MACD", "MACD_signal", "MACD_hist", "BB_width",
    "return_1d", "return_3d", "return_5d", "return_10d", "return_20d",
    "volume_change", "volume_ratio",
    "price_to_ma5", "price_to_ma20", "price_to_ma60",
    "bb_position", "macd_hist_change", "candle_strength",
]


def train_model(df: pd.DataFrame):
    """
    XGBoost 모델 학습 + 시계열 교차검증
    TimeSeriesSplit: 미래 데이터로 과거를 예측하는 look-ahead bias 방지
    """
    df = df.dropna(subset=FEATURE_COLS + ["target"])

    X = df[FEATURE_COLS]
    y = df["target"]

    # 시계열 교차검증 (일반 KFold 쓰면 미래 데이터 누수 발생)
    tscv = TimeSeriesSplit(n_splits=5)
    scores = []

    print("시계열 교차검증 중...")
    for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
        X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]

        model = XGBClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            eval_metric="logloss",
            verbosity=0,
        )
        model.fit(X_train, y_train)
        acc = accuracy_score(y_val, model.predict(X_val))
        scores.append(acc)
        print(f"  Fold {fold+1}: {acc:.4f}")

    print(f"평균 정확도: {np.mean(scores):.4f} (+/- {np.std(scores):.4f})")

    # 전체 데이터로 최종 모델 학습
    # train/test split (마지막 20%를 테스트)
    split = int(len(X) * 0.8)
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]

    final_model = XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        eval_metric="logloss",
        verbosity=0,
    )
    final_model.fit(X_train, y_train)

    print("\n=== 테스트셋 성능 ===")
    y_pred = final_model.predict(X_test)
    print(classification_report(y_test, y_pred, target_names=["하락", "상승"]))

    return final_model, X_test.index


def get_feature_importance(model, top_n: int = 10):
    """피처 중요도 출력"""
    importance = pd.Series(
        model.feature_importances_,
        index=FEATURE_COLS
    ).sort_values(ascending=False)

    print(f"\n=== 피처 중요도 Top {top_n} ===")
    for feat, imp in importance.head(top_n).items():
        bar = "#" * int(imp * 100)
        print(f"  {feat:<20} {imp:.4f} {bar}")

    return importance


def add_ml_signal(df: pd.DataFrame, model) -> pd.DataFrame:
    """
    ML 예측 확률을 신호에 추가
    - 상승 확률 > 0.6 → 매수
    - 상승 확률 < 0.4 → 매도
    """
    df = df.copy()
    valid = df[FEATURE_COLS].dropna()

    proba = model.predict_proba(valid)[:, 1]
    df.loc[valid.index, "ml_proba"] = proba

    # ML 신호
    df["ml_signal"] = "중립"
    df.loc[df["ml_proba"] > 0.6, "ml_signal"] = "매수"
    df.loc[df["ml_proba"] < 0.4, "ml_signal"] = "매도"

    # 기존 mtf_signal과 AND 조건으로 결합
    # 둘 다 매수일 때만 매수
    df["final_signal"] = "중립"
    buy = (df["mtf_signal"] == "매수") & (df["ml_signal"] == "매수")
    sell = (df["mtf_signal"] == "매도") | (df["ml_signal"] == "매도")
    df.loc[buy, "final_signal"] = "매수"
    df.loc[sell, "final_signal"] = "매도"

    return df


class MLBacktester(Backtester):
    """ML 신호 기반 백테스터"""

    def run(self, df: pd.DataFrame, fee_rate: float = 0.00015) -> dict:
        df = df.copy()
        df["signal"] = df["final_signal"]
        return super().run(df, fee_rate)


if __name__ == "__main__":
    # 데이터 준비
    df = get_stock_data("005930.KS", period="3y")
    df = add_all_indicators(df)
    df = add_mtf_signal(df)
    df = build_features(df)

    # 모델 학습
    print("=" * 50)
    print("  XGBoost 모델 학습")
    print("=" * 50)
    model, test_idx = train_model(df)

    # 피처 중요도
    get_feature_importance(model)

    # ML 신호 추가
    df = add_ml_signal(df, model)

    print("\n신호 분포:")
    print(df["final_signal"].value_counts())

    # 백테스트 비교
    print("\n")
    bt_base = Backtester(initial_capital=10_000_000, stop_loss=0.05, take_profit=0.10)
    df_base = df.copy()
    df_base["signal"] = df_base["mtf_signal"]
    print_result(bt_base.run(df_base), "기존 전략 (MTF)")

    bt_ml = MLBacktester(initial_capital=10_000_000, stop_loss=0.05, take_profit=0.10)
    print_result(bt_ml.run(df), "ML 결합 전략")

    print("\n=== 최종 비교 ===")
    r1 = bt_base.run(df_base)
    r2 = bt_ml.run(df)
    print(f"{'':20} {'기존 MTF':>10} {'ML 결합':>10}")
    print(f"{'수익률':20} {r1['수익률']:>9.2f}% {r2['수익률']:>9.2f}%")
    print(f"{'MDD':20} {r1['MDD']:>9.2f}% {r2['MDD']:>9.2f}%")
    print(f"{'승률':20} {r1['승률']:>9.1f}% {r2['승률']:>9.1f}%")
    print(f"{'총거래횟수':20} {r1['총거래횟수']:>10} {r2['총거래횟수']:>10}")
