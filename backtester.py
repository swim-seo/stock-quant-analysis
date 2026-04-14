import pandas as pd
import numpy as np
from data_collector import get_stock_data
from indicators import add_all_indicators


class Backtester:
    """
    전략 백테스트 클래스

    기본 가정:
    - 매수/매도 신호 발생 다음날 시가에 체결
    - 손절/익절은 당일 종가 기준으로 체크
    - 한 번에 전액 투자 (단일 포지션)
    """

    def __init__(
        self,
        initial_capital: float = 10_000_000,
        stop_loss: float = 0.05,     # 손절선 5%
        take_profit: float = 0.10,   # 익절선 10%
        position_size: float = 1.0,  # 자본 대비 투자 비율 (1.0 = 전액)
    ):
        self.initial_capital = initial_capital
        self.stop_loss = stop_loss
        self.take_profit = take_profit
        self.position_size = position_size

    def run(self, df: pd.DataFrame, fee_rate: float = 0.00015) -> dict:
        """
        백테스트 실행

        Args:
            df: 지표가 포함된 데이터프레임
            fee_rate: 거래 수수료 (기본 0.015%)

        Returns:
            백테스트 결과 딕셔너리
        """
        capital = self.initial_capital
        position = 0
        buy_price = 0
        trades = []
        portfolio_values = []

        for i in range(1, len(df)):
            today = df.iloc[i]
            yesterday = df.iloc[i - 1]
            date = df.index[i]

            portfolio_value = capital + position * today["종가"]
            portfolio_values.append({"날짜": date, "포트폴리오가치": portfolio_value})

            # 포지션 보유 중 → 손절/익절 체크
            if position > 0:
                current_return = (today["종가"] - buy_price) / buy_price

                # 손절
                if current_return <= -self.stop_loss:
                    price = today["종가"]
                    revenue = position * price * (1 - fee_rate)
                    capital += revenue
                    trades.append({
                        "날짜": date, "구분": "손절",
                        "가격": price, "수량": position,
                        "금액": revenue, "수익률": round(current_return * 100, 2),
                    })
                    position = 0
                    buy_price = 0
                    continue

                # 익절
                elif current_return >= self.take_profit:
                    price = today["종가"]
                    revenue = position * price * (1 - fee_rate)
                    capital += revenue
                    trades.append({
                        "날짜": date, "구분": "익절",
                        "가격": price, "수량": position,
                        "금액": revenue, "수익률": round(current_return * 100, 2),
                    })
                    position = 0
                    buy_price = 0
                    continue

            # 매수 신호
            if yesterday["signal"] == "매수" and position == 0 and capital > 0:
                price = today["시가"]
                invest_capital = capital * self.position_size
                shares = int(invest_capital / price)
                cost = shares * price * (1 + fee_rate)

                if shares > 0 and cost <= capital:
                    position = shares
                    buy_price = price
                    capital -= cost
                    trades.append({
                        "날짜": date, "구분": "매수",
                        "가격": price, "수량": shares,
                        "금액": cost, "수익률": 0,
                    })

            # 매도 신호
            elif yesterday["signal"] == "매도" and position > 0:
                price = today["시가"]
                current_return = (price - buy_price) / buy_price
                revenue = position * price * (1 - fee_rate)
                capital += revenue
                trades.append({
                    "날짜": date, "구분": "매도",
                    "가격": price, "수량": position,
                    "금액": revenue, "수익률": round(current_return * 100, 2),
                })
                position = 0
                buy_price = 0

        # 마지막 보유 포지션 청산
        if position > 0:
            last_price = df.iloc[-1]["종가"]
            capital += position * last_price * (1 - fee_rate)

        return self._calculate_stats(capital, trades, portfolio_values)

    def _calculate_stats(self, final_capital: float, trades: list, portfolio_values: list) -> dict:
        """성과 통계 계산"""
        total_return = (final_capital - self.initial_capital) / self.initial_capital * 100
        trades_df = pd.DataFrame(trades)
        portfolio_df = pd.DataFrame(portfolio_values).set_index("날짜")

        # 최대 낙폭 (MDD) 계산
        portfolio_df["peak"] = portfolio_df["포트폴리오가치"].cummax()
        portfolio_df["drawdown"] = (portfolio_df["포트폴리오가치"] - portfolio_df["peak"]) / portfolio_df["peak"] * 100
        mdd = portfolio_df["drawdown"].min()

        # 승률 계산
        win_rate = 0
        if not trades_df.empty and len(trades_df[trades_df["구분"] == "매도"]) > 0:
            buy_prices = trades_df[trades_df["구분"] == "매수"]["가격"].values
            sell_prices = trades_df[trades_df["구분"] == "매도"]["가격"].values
            n = min(len(buy_prices), len(sell_prices))
            if n > 0:
                wins = sum(sell_prices[:n] > buy_prices[:n])
                win_rate = wins / n * 100

        return {
            "초기자본": self.initial_capital,
            "최종자본": round(final_capital),
            "수익금": round(final_capital - self.initial_capital),
            "수익률": round(total_return, 2),
            "MDD": round(mdd, 2),
            "총거래횟수": len(trades_df),
            "매수횟수": len(trades_df[trades_df["구분"] == "매수"]) if not trades_df.empty else 0,
            "매도횟수": len(trades_df[trades_df["구분"] == "매도"]) if not trades_df.empty else 0,
            "승률": round(win_rate, 1),
            "거래내역": trades_df,
            "포트폴리오": portfolio_df,
        }


def print_result(result: dict, name: str = ""):
    """백테스트 결과 출력"""
    print(f"\n{'='*40}")
    print(f"  {name} 백테스트 결과")
    print(f"{'='*40}")
    print(f"초기 자본:   {result['초기자본']:>15,.0f} 원")
    print(f"최종 자본:   {result['최종자본']:>15,.0f} 원")
    print(f"수익금:      {result['수익금']:>15,.0f} 원")
    print(f"수익률:      {result['수익률']:>14.2f} %")
    print(f"MDD:         {result['MDD']:>14.2f} %")
    print(f"총 거래횟수: {result['총거래횟수']:>15} 회")
    print(f"승률:        {result['승률']:>14.1f} %")
    print(f"{'='*40}")

    if not result["거래내역"].empty:
        print("\n최근 거래 내역:")
        print(result["거래내역"].tail(6).to_string(index=False))


if __name__ == "__main__":
    df = get_stock_data("005930.KS", period="2y")
    df = add_all_indicators(df)

    print("[ 리스크 관리 없음 ]")
    bt_base = Backtester(initial_capital=10_000_000, stop_loss=99.0, take_profit=99.0)
    print_result(bt_base.run(df), "삼성전자 (기본)")

    print("\n[ 손절 5% / 익절 10% ]")
    bt = Backtester(initial_capital=10_000_000, stop_loss=0.05, take_profit=0.10)
    print_result(bt.run(df), "삼성전자 (리스크 관리)")

    print("\n[ 손절 3% / 익절 15% / 투자비율 50% ]")
    bt2 = Backtester(initial_capital=10_000_000, stop_loss=0.03, take_profit=0.15, position_size=0.5)
    print_result(bt2.run(df), "삼성전자 (보수적)")
