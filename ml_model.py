import pandas as pd
import numpy as np
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import StandardScaler
from data_collector import get_stock_data
from indicators import add_all_indicators
from multi_timeframe import add_mtf_signal
from backtester import Backtester, print_result


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    ML 피처 생성 (v2 - 확장)
    - 기술 지표 원값 + 신규 지표 (ATR, Stochastic, OBV, ADX, CCI, Williams%R)
    - 변화율 (전일 대비)
    - 과거 n일 수익률
    - 변동성/추세 강도 피처
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
    df["volume_ratio"] = df["거래량"] / df["volume_ma5"]

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

    # ── 신규 피처 (v2) ──────────────────────────────────
    # 스토캐스틱 K-D 차이 (모멘텀 방향)
    df["stoch_kd_diff"] = df["STOCH_K"] - df["STOCH_D"]

    # ADX 추세 강도 + 방향
    df["di_diff"] = df["PLUS_DI"] - df["MINUS_DI"]  # 양이면 상승 추세

    # ATR 변화율 (변동성 확대/축소)
    df["atr_change"] = df["ATR_pct"].pct_change(5)

    # OBV 시그널 (매집/분산 판단)
    df["obv_momentum"] = df["OBV"].pct_change(10)

    # RSI 변화 속도
    df["rsi_change"] = df["RSI"].diff(3)

    # 가격 변동성 (5일 표준편차)
    df["volatility_5d"] = df["return_1d"].rolling(5).std()
    df["volatility_20d"] = df["return_1d"].rolling(20).std()

    # 고가-저가 레인지 비율 (일중 변동성)
    df["intraday_range"] = (df["고가"] - df["저가"]) / df["종가"]

    # 갭 (전일 종가 대비 오늘 시가)
    df["gap"] = df["시가"] / df["종가"].shift(1) - 1

    # 타겟: 다음날 종가가 오늘보다 높으면 1 (상승), 낮으면 0 (하락)
    df["target"] = (df["종가"].shift(-1) > df["종가"]).astype(int)

    return df


# v1 기존 18개 + v2 신규 13개 = 총 31개 피처
FEATURE_COLS = [
    # 기술 지표 원값
    "RSI", "MACD", "MACD_signal", "MACD_hist", "BB_width",
    "ADX", "STOCH_K", "STOCH_D", "CCI", "WILLIAMS_R", "ATR_pct",
    # 수익률
    "return_1d", "return_3d", "return_5d", "return_10d", "return_20d",
    # 거래량
    "volume_change", "volume_ratio",
    # 이동평균 대비 위치
    "price_to_ma5", "price_to_ma20", "price_to_ma60",
    # 파생 피처
    "bb_position", "macd_hist_change", "candle_strength",
    "stoch_kd_diff", "di_diff", "atr_change", "obv_momentum",
    "rsi_change", "volatility_5d", "volatility_20d",
    "intraday_range", "gap",
]


def train_model(df: pd.DataFrame):
    """
    앙상블 모델 학습 (XGBoost + LightGBM)
    - TimeSeriesSplit 5-fold 교차검증
    - 두 모델의 예측 확률을 가중 평균으로 결합
    """
    df = df.dropna(subset=FEATURE_COLS + ["target"])

    X = df[FEATURE_COLS]
    y = df["target"]

    # 시계열 교차검증
    tscv = TimeSeriesSplit(n_splits=5)
    xgb_scores = []
    lgb_scores = []
    ens_scores = []

    print("시계열 교차검증 중... (XGBoost + LightGBM 앙상블)")
    for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
        X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]

        # XGBoost
        xgb = XGBClassifier(
            n_estimators=300, max_depth=4, learning_rate=0.03,
            subsample=0.8, colsample_bytree=0.7, reg_alpha=0.1, reg_lambda=1.0,
            random_state=42, eval_metric="logloss", verbosity=0,
        )
        xgb.fit(X_train, y_train)

        # LightGBM
        lgb = LGBMClassifier(
            n_estimators=300, max_depth=4, learning_rate=0.03,
            subsample=0.8, colsample_bytree=0.7, reg_alpha=0.1, reg_lambda=1.0,
            random_state=42, verbose=-1,
        )
        lgb.fit(X_train, y_train)

        # 앙상블 (가중 평균: XGBoost 0.5 + LightGBM 0.5)
        xgb_proba = xgb.predict_proba(X_val)[:, 1]
        lgb_proba = lgb.predict_proba(X_val)[:, 1]
        ens_proba = 0.5 * xgb_proba + 0.5 * lgb_proba
        ens_pred = (ens_proba > 0.5).astype(int)

        xgb_acc = accuracy_score(y_val, xgb.predict(X_val))
        lgb_acc = accuracy_score(y_val, lgb.predict(X_val))
        ens_acc = accuracy_score(y_val, ens_pred)

        xgb_scores.append(xgb_acc)
        lgb_scores.append(lgb_acc)
        ens_scores.append(ens_acc)
        print(f"  Fold {fold+1}: XGB {xgb_acc:.4f} | LGB {lgb_acc:.4f} | 앙상블 {ens_acc:.4f}")

    print(f"\n평균 정확도:")
    print(f"  XGBoost:  {np.mean(xgb_scores):.4f} (+/- {np.std(xgb_scores):.4f})")
    print(f"  LightGBM: {np.mean(lgb_scores):.4f} (+/- {np.std(lgb_scores):.4f})")
    print(f"  앙상블:    {np.mean(ens_scores):.4f} (+/- {np.std(ens_scores):.4f})")

    # 최종 모델 학습 (마지막 20% 테스트)
    split = int(len(X) * 0.8)
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]

    final_xgb = XGBClassifier(
        n_estimators=300, max_depth=4, learning_rate=0.03,
        subsample=0.8, colsample_bytree=0.7, reg_alpha=0.1, reg_lambda=1.0,
        random_state=42, eval_metric="logloss", verbosity=0,
    )
    final_xgb.fit(X_train, y_train)

    final_lgb = LGBMClassifier(
        n_estimators=300, max_depth=4, learning_rate=0.03,
        subsample=0.8, colsample_bytree=0.7, reg_alpha=0.1, reg_lambda=1.0,
        random_state=42, verbose=-1,
    )
    final_lgb.fit(X_train, y_train)

    # 앙상블 테스트 성능
    xgb_proba = final_xgb.predict_proba(X_test)[:, 1]
    lgb_proba = final_lgb.predict_proba(X_test)[:, 1]
    ens_proba = 0.5 * xgb_proba + 0.5 * lgb_proba
    ens_pred = (ens_proba > 0.5).astype(int)

    print("\n=== 테스트셋 성능 (앙상블) ===")
    print(classification_report(y_test, ens_pred, target_names=["하락", "상승"]))

    # EnsembleModel 래퍼 반환
    final_model = EnsembleModel(final_xgb, final_lgb)
    return final_model, X_test.index


class EnsembleModel:
    """XGBoost + LightGBM 앙상블 래퍼"""

    def __init__(self, xgb_model, lgb_model, xgb_weight=0.5):
        self.xgb = xgb_model
        self.lgb = lgb_model
        self.xgb_weight = xgb_weight
        self.lgb_weight = 1 - xgb_weight
        # XGBoost의 feature_importances_ 노출 (호환성)
        self.feature_importances_ = (
            xgb_weight * xgb_model.feature_importances_
            + (1 - xgb_weight) * lgb_model.feature_importances_
        )

    def predict_proba(self, X):
        xgb_p = self.xgb.predict_proba(X)
        lgb_p = self.lgb.predict_proba(X)
        return self.xgb_weight * xgb_p + self.lgb_weight * lgb_p

    def predict(self, X):
        proba = self.predict_proba(X)[:, 1]
        return (proba > 0.5).astype(int)


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
