import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from data_collector import get_stock_data, KOSPI_STOCKS
from indicators import add_all_indicators
from multi_timeframe import add_mtf_signal
from ml_model import build_features, train_model, add_ml_signal, FEATURE_COLS
from youtube_collector import get_latest_insights, get_market_sentiment_score
from fear_greed_korea import calculate_korea_fear_greed, display_fear_greed_widget

st.set_page_config(
    page_title="한국 주식 AI 분석",
    page_icon="📈",
    layout="wide",
)

# 한국어 종목명 매핑
KOREAN_NAMES = {
    "005930.KS": "삼성전자", "000660.KS": "SK하이닉스", "005380.KS": "현대차",
    "035420.KS": "NAVER", "035720.KS": "카카오", "051910.KS": "LG화학",
    "006400.KS": "삼성SDI", "068270.KS": "셀트리온", "207940.KS": "삼성바이오로직스",
    "003550.KS": "LG", "055550.KS": "신한지주", "105560.KS": "KB금융",
    "012330.KS": "현대모비스", "000270.KS": "기아", "096770.KS": "SK이노베이션",
    "373220.KS": "LG에너지솔루션", "047050.KS": "포스코인터내셔널",
    "028260.KS": "삼성물산", "009150.KS": "삼성전기", "066570.KS": "LG전자",
    "003670.KS": "포스코퓨처엠", "034730.KS": "SK", "030200.KS": "KT",
    "017670.KS": "SK텔레콤", "010130.KS": "고려아연", "032830.KS": "삼성생명",
    "086790.KS": "하나금융지주", "316140.KS": "우리금융지주",
    "011200.KS": "HMM", "009540.KS": "한국조선해양",
    "042700.KS": "한미반도체", "247540.KS": "에코프로비엠", "383220.KQ": "에코프로",
    "460850.KQ": "알테오젠", "196170.KQ": "알테오젠", "293490.KQ": "카카오게임즈",
    "263750.KQ": "펄어비스", "112040.KQ": "위메이드",
    "^KS11": "코스피 지수", "^KQ11": "코스닥 지수",
}

# 한글 종목명 → 종목코드 역방향 매핑 (자동 생성)
NAME_TO_TICKER = {name: ticker for ticker, name in KOREAN_NAMES.items()}
# 자주 쓰는 별칭 추가
NAME_TO_TICKER.update({
    "삼전": "005930.KS", "하이닉스": "000660.KS", "현차": "005380.KS",
    "네이버": "035420.KS", "카카오": "035720.KS",
    "셀트리온": "068270.KS", "삼바": "207940.KS", "삼성바이오": "207940.KS",
    "기아차": "000270.KS", "모비스": "012330.KS",
    "LG엔솔": "373220.KS", "엔솔": "373220.KS",
    "에코프로비엠": "247540.KQ", "에코프로": "383220.KQ",
    "알테오젠": "460850.KQ",
    "코스피": "^KS11", "코스닥": "^KQ11",
    "한미반도체": "042700.KS", "포스코퓨처엠": "003670.KS",
    "SK하이닉스": "000660.KS", "삼성전자": "005930.KS",
})

# 사이드바
with st.sidebar:
    st.header("종목 설정")
    stock_raw = st.text_input(
        "종목명 또는 종목코드 입력",
        value="",
        help="한글 종목명(삼성전자) 또는 종목코드(005930.KS) 모두 가능"
    )
    # 한글 종목명이면 자동으로 종목코드로 변환
    stock_input = NAME_TO_TICKER.get(stock_raw.strip(), stock_raw.strip())
    if stock_raw.strip() and stock_input != stock_raw.strip():
        st.caption(f"✅ {stock_raw.strip()} → `{stock_input}`")
    else:
        st.caption("예시: 삼성전자, SK하이닉스, 005930.KS, ^KS11")

    period = st.selectbox("기간", ["3mo", "6mo", "1y", "2y", "3y"], index=2)
    st.divider()

    st.header("자주 쓰는 종목")
    quick_stocks = {
        "삼성전자": "005930.KS",
        "SK하이닉스": "000660.KS",
        "현대차": "005380.KS",
        "코스피 지수": "^KS11",
        "코스닥 지수": "^KQ11",
    }
    for name, ticker in quick_stocks.items():
        if st.button(name, use_container_width=True):
            stock_input = ticker
            st.rerun()

    st.divider()

    # 공포탐욕 위젯 (항상 표시)
    with st.spinner("공포탐욕 지수 계산 중..."):
        try:
            fg_data = calculate_korea_fear_greed()
            display_fear_greed_widget(fg_data)
        except Exception as _e:
            st.caption(f"공포탐욕 지수 오류: {_e}")

# 메인 영역
if not stock_input:
    # ── 초기 화면 ──────────────────────────────────────────────────────
    def _tag(text, color):
        return (
            f'<span style="font-size:10px;background:{color}22;color:{color};'
            f'padding:2px 8px;border-radius:3px;white-space:nowrap;">{text}</span>'
        )

    def _card(icon, title, subtitle_tags, desc, accent, col_span=""):
        tags_html = "".join(_tag(t, accent) for t in subtitle_tags)
        return f"""<div style="background:#111118;border:1px solid #1e1e28;border-top:2px solid {accent};
border-radius:10px;padding:22px 20px;{col_span}">
<div style="font-size:26px;margin-bottom:12px;">{icon}</div>
<div style="font-size:14px;font-weight:700;color:#ececec;margin-bottom:8px;">{title}</div>
<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;">{tags_html}</div>
<div style="font-size:12px;color:#7a7a8c;line-height:1.7;">{desc}</div>
</div>"""

    st.markdown("""<div style="text-align:center;padding:44px 0 36px;">
<div style="font-size:10px;letter-spacing:5px;color:#f0a500;font-weight:700;margin-bottom:14px;">KOREA STOCK · AI QUANT SYSTEM</div>
<div style="font-size:32px;font-weight:800;color:#f0f0f0;letter-spacing:-0.5px;line-height:1.3;">한국 주식 AI 분석 시스템</div>
<div style="font-size:13px;color:#555568;margin-top:10px;letter-spacing:0.5px;">기술 지표 &nbsp;×&nbsp; ML 예측 &nbsp;×&nbsp; 유튜브 인사이트를 하나로</div>
</div>""", unsafe_allow_html=True)

    c1 = _card("📊", "차트를 자동으로 읽어요",
               ["MA5/MA20/MA60", "볼린저밴드", "RSI", "MACD", "골든크로스"],
               "단기·중기·장기 흐름을 한눈에 파악하고, 지금 오르는 추세인지 꺾이는 추세인지 알려줘요.",
               "#2196f3")
    c2 = _card("🎯", "지금 들어가도 되는지 판단해줘요",
               ["정배열", "골든크로스", "RSI", "주봉 추세", "거래량"],
               "5가지 조건을 체크해서 <b>진입 추천 / 대기 / 위험</b>으로 알려줘요.",
               "#00c853")
    c3 = _card("📺", "유튜브 전문가 의견도 같이 봐요",
               ["한국경제TV", "매일경제TV", "단타/스윙 구분"],
               "매일 자동 수집해서 이 종목 관련 최신 의견을 요약해줘요.",
               "#ff6b35")
    c4 = _card("🔮", "내일 주가를 예측해줘요",
               ["기술지표 18개 피처", "전문가 의견 결합"],
               "오를지 내릴지, 예상 종가까지 알려줘요.",
               "#9c6bff")
    c5 = _card("⏱️", "일봉 + 주봉 같이 봐요",
               ["주봉 하락 추세면 매수 차단", "다중 시간프레임"],
               "큰 흐름과 반대로 진입하는 실수를 막아줘요.",
               "#f0a500")

    st.markdown(f"""<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px;">
{c1}{c2}{c3}
</div>
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:28px;">
{c4}{c5}
</div>""", unsafe_allow_html=True)

    with st.expander("🔧 시스템 정보"):
        col_a, col_b = st.columns(2)
        with col_a:
            st.markdown("**ML 엔진**")
            st.caption("• XGBoost Classifier")
            st.caption("• 18개 기술 지표 피처")
            st.caption("• TimeSeriesSplit 교차검증 (5-fold)")
        with col_b:
            st.markdown("**RAG 엔진**")
            st.caption("• ChromaDB 벡터 검색 (KR-SBERT)")
            st.caption("• Supabase 키워드 검색")
            st.caption("• Hybrid RAG · RRF 합산 스코어링")

    st.markdown("""<div style="text-align:center;padding:24px 0 8px;">
<div style="display:inline-block;background:#111118;border:1px solid #1e1e28;border-radius:8px;
padding:14px 28px;font-size:13px;color:#7a7a8c;letter-spacing:0.3px;">
⬅&nbsp; 왼쪽에서 종목 코드를 입력하면 바로 분석을 시작합니다
</div>
</div>""", unsafe_allow_html=True)

elif stock_input:
    with st.spinner("데이터 수집 중..."):
        df = get_stock_data(stock_input, period=period)

    if df is None or df.empty:
        st.error("데이터를 가져올 수 없습니다. 종목 코드를 확인해주세요.")
        st.stop()

    df = add_all_indicators(df)
    df = add_mtf_signal(df)
    df = build_features(df)

    # 종목명 가져오기
    try:
        import yfinance as yf
        _info = yf.Ticker(stock_input).info
        _yf_name = _info.get("shortName") or _info.get("longName") or stock_input
    except Exception:
        _yf_name = stock_input
    display_name = KOREAN_NAMES.get(stock_input, _yf_name)

    st.title(f"📈 {display_name} ({stock_input})")

    # 최신 데이터
    latest = df.iloc[-1]
    prev = df.iloc[-2]
    price_change = latest["종가"] - prev["종가"]
    price_change_pct = price_change / prev["종가"] * 100

    # 상단 지표 카드
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("현재가", f"{latest['종가']:,.0f}원",
                  f"{price_change:+,.0f}원 ({price_change_pct:+.2f}%)")
    with col2:
        rsi_val = latest["RSI"]
        rsi_status = "과매수" if rsi_val > 70 else "과매도" if rsi_val < 30 else "중립"
        st.metric("RSI", f"{rsi_val:.1f}", rsi_status)
    with col3:
        signal = latest["mtf_signal"]
        signal_color = "🟢" if signal == "매수" else "🔴" if signal == "매도" else "⚪"
        st.metric("현재 신호", f"{signal_color} {signal}")
    with col4:
        vol_ratio = latest.get("volume_ratio", 1)
        st.metric("거래량 비율", f"{vol_ratio:.1f}x", "평균 대비")

    st.divider()

    # 진입 신호 판단 카드
    # 조건 계산
    ma5, ma20, ma60 = latest["MA5"], latest["MA20"], latest["MA60"]
    cond_ma = ma5 > ma20 > ma60

    recent = df.tail(20)
    golden_cross_recent = recent["golden_cross"].any()

    rsi = latest["RSI"]
    cond_rsi = 30 <= rsi <= 70

    cond_weekly = latest.get("주봉추세", "하락") == "상승"
    weekly_trend = latest.get("주봉추세", "하락")

    vol_avg_20 = df["거래량"].tail(20).mean()
    cond_vol = latest["거래량"] >= vol_avg_20
    vol_ratio = latest["거래량"] / vol_avg_20

    conditions = [cond_ma, golden_cross_recent, cond_rsi, cond_weekly, cond_vol]
    satisfied = sum(conditions)
    progress = satisfied / 5

    if satisfied >= 4:
        judge_label = "진입 추천"
        judge_emoji = "🟢"
        judge_color = "#00c853"
        judge_bg = "rgba(0,200,83,0.08)"
        judge_border = "#00c853"
    elif satisfied == 3:
        judge_label = "대기"
        judge_emoji = "🟡"
        judge_color = "#ffab00"
        judge_bg = "rgba(255,171,0,0.08)"
        judge_border = "#ffab00"
    else:
        judge_label = "위험"
        judge_emoji = "🔴"
        judge_color = "#ff1744"
        judge_bg = "rgba(255,23,68,0.08)"
        judge_border = "#ff1744"

    def cond_row(icon, name, value, detail, passed):
        bg = "rgba(0,200,83,0.06)" if passed else "rgba(255,23,68,0.06)"
        border = "#00c853" if passed else "#ff1744"
        val_color = "#00c853" if passed else "#ff1744"
        return f"""<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:{bg};border-left:3px solid {border};border-radius:6px;margin-bottom:8px;">
<span style="font-size:18px;min-width:24px;">{icon}</span>
<div style="flex:1;">
<div style="font-size:13px;font-weight:600;color:#e0e0e0;">{name}</div>
<div style="font-size:11px;color:#9e9e9e;margin-top:1px;">{detail}</div>
</div>
<div style="font-size:13px;font-weight:700;color:{val_color};">{value}</div>
</div>"""

    bar_pct = int(progress * 100)

    conditions_html = "".join([
        cond_row("✅" if cond_ma else "❌", "정배열", "충족" if cond_ma else "미충족", f"MA5({ma5:,.0f}) &gt; MA20({ma20:,.0f}) &gt; MA60({ma60:,.0f})", cond_ma),
        cond_row("✅" if golden_cross_recent else "❌", "골든크로스", "최근 20일 내" if golden_cross_recent else "미발생", "MA5가 MA20 상향 돌파 여부", golden_cross_recent),
        cond_row("✅" if cond_rsi else "⚠️", "RSI", f"{rsi:.1f}", "과매도(30↓) ~ 과매수(70↑) 판단", cond_rsi),
        cond_row("✅" if cond_weekly else "❌", "주봉 추세", weekly_trend, "주봉 MA5 &gt; MA20 여부", cond_weekly),
        cond_row("✅" if cond_vol else "❌", "거래량", f"{vol_ratio:.1f}x", "20일 평균 대비 거래량 비율", cond_vol),
    ])

    html = f"""<div style="font-family:sans-serif;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:12px;padding:20px 24px;margin-bottom:16px;">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
<div style="font-size:13px;font-weight:600;color:#9e9e9e;letter-spacing:2px;">🎯 진입 신호 판단</div>
<div style="display:flex;align-items:center;gap:8px;padding:8px 18px;background:{judge_bg};border:1.5px solid {judge_border};border-radius:24px;">
<span style="font-size:18px;">{judge_emoji}</span>
<span style="font-size:15px;font-weight:700;color:{judge_color};">{judge_label}</span>
</div>
</div>
<div style="margin:14px 0 18px;">
<div style="display:flex;justify-content:space-between;font-size:11px;color:#757575;margin-bottom:6px;">
<span>조건 충족</span>
<span style="color:{judge_color};font-weight:600;">{satisfied} / 5</span>
</div>
<div style="height:5px;background:#2a2a3e;border-radius:3px;overflow:hidden;">
<div style="height:100%;width:{bar_pct}%;background:linear-gradient(90deg,{judge_color}88,{judge_color});border-radius:3px;"></div>
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
{conditions_html}
</div>
</div>"""
    st.markdown(html, unsafe_allow_html=True)

    # 차트
    tab1, tab2, tab3 = st.tabs(["📊 차트", "🤖 AI 예측", "📰 유튜브 인사이트"])

    with tab1:
        fig = make_subplots(
            rows=3, cols=1,
            shared_xaxes=True,
            row_heights=[0.6, 0.2, 0.2],
            vertical_spacing=0.05,
        )

        # 캔들스틱
        fig.add_trace(go.Candlestick(
            x=df.index,
            open=df["시가"],
            high=df["고가"],
            low=df["저가"],
            close=df["종가"],
            name="주가",
            increasing_line_color="#ef5350",
            decreasing_line_color="#26a69a",
        ), row=1, col=1)

        # 이동평균선
        for ma, color in [("MA5", "#ff9800"), ("MA20", "#2196f3"), ("MA60", "#9c27b0")]:
            fig.add_trace(go.Scatter(
                x=df.index, y=df[ma],
                name=ma, line=dict(color=color, width=1),
            ), row=1, col=1)

        # 볼린저밴드
        fig.add_trace(go.Scatter(
            x=df.index, y=df["BB_upper"],
            name="BB상단", line=dict(color="gray", width=1, dash="dash"),
            opacity=0.5,
        ), row=1, col=1)
        fig.add_trace(go.Scatter(
            x=df.index, y=df["BB_lower"],
            name="BB하단", line=dict(color="gray", width=1, dash="dash"),
            fill="tonexty", fillcolor="rgba(128,128,128,0.05)",
            opacity=0.5,
        ), row=1, col=1)

        # 매수/매도 신호 표시
        buy_signals = df[df["mtf_signal"] == "매수"]
        sell_signals = df[df["mtf_signal"] == "매도"]

        fig.add_trace(go.Scatter(
            x=buy_signals.index, y=buy_signals["저가"] * 0.99,
            mode="markers", name="매수신호",
            marker=dict(symbol="triangle-up", size=10, color="#ef5350"),
        ), row=1, col=1)

        fig.add_trace(go.Scatter(
            x=sell_signals.index, y=sell_signals["고가"] * 1.01,
            mode="markers", name="매도신호",
            marker=dict(symbol="triangle-down", size=10, color="#26a69a"),
        ), row=1, col=1)

        # RSI
        fig.add_trace(go.Scatter(
            x=df.index, y=df["RSI"],
            name="RSI", line=dict(color="#ff9800", width=1.5),
        ), row=2, col=1)
        fig.add_hline(y=70, line_dash="dash", line_color="red", opacity=0.5, row=2, col=1)
        fig.add_hline(y=30, line_dash="dash", line_color="blue", opacity=0.5, row=2, col=1)

        # 거래량
        colors = ["#ef5350" if c >= o else "#26a69a"
                  for c, o in zip(df["종가"], df["시가"])]
        fig.add_trace(go.Bar(
            x=df.index, y=df["거래량"],
            name="거래량", marker_color=colors, opacity=0.7,
        ), row=3, col=1)

        fig.update_layout(
            height=700,
            xaxis_rangeslider_visible=False,
            legend=dict(orientation="h", yanchor="bottom", y=1.02),
            margin=dict(l=0, r=0, t=30, b=0),
        )
        fig.update_yaxes(title_text="가격(원)", row=1, col=1)
        fig.update_yaxes(title_text="RSI", row=2, col=1)
        fig.update_yaxes(title_text="거래량", row=3, col=1)

        st.plotly_chart(fig, use_container_width=True)

    with tab2:
        st.subheader("🤖 ML 기반 예측")

        with st.spinner("모델 학습 중... (처음 한 번만 오래 걸려요)"):
            try:
                df_3y = get_stock_data(stock_input, period="3y")
                df_3y = add_all_indicators(df_3y)
                df_3y = add_mtf_signal(df_3y)
                df_3y = build_features(df_3y)

                model, _ = train_model(df_3y)
                df_pred = add_ml_signal(df_3y, model)

                latest_pred = df_pred.iloc[-1]
                proba = latest_pred.get("ml_proba", 0.5)
                final_signal = latest_pred.get("final_signal", "중립")

                col1, col2 = st.columns(2)
                with col1:
                    st.metric("내일 상승 확률", f"{proba*100:.1f}%")
                    st.metric("ML 신호", final_signal)

                with col2:
                    # 간단한 예상가
                    expected_return = (proba - 0.5) * 0.04
                    expected_price = latest["종가"] * (1 + expected_return)
                    st.metric("내일 예상가 (참고용)", f"{expected_price:,.0f}원",
                              f"{expected_return*100:+.2f}%")
                    st.caption("※ 예상가는 확률 기반 추정치로 실제와 다를 수 있습니다.")

                # 피처 중요도
                import pandas as pd
                importance = pd.Series(
                    model.feature_importances_,
                    index=FEATURE_COLS
                ).sort_values(ascending=True).tail(10)

                fig_imp = go.Figure(go.Bar(
                    x=importance.values,
                    y=importance.index,
                    orientation="h",
                    marker_color="#2196f3",
                ))
                fig_imp.update_layout(
                    title="피처 중요도 Top 10",
                    height=350,
                    margin=dict(l=0, r=0, t=40, b=0),
                )
                st.plotly_chart(fig_imp, use_container_width=True)

            except Exception as e:
                st.warning(f"예측 데이터 부족 또는 오류: {e}")

    with tab3:
        st.subheader("📰 최근 유튜브 인사이트")

        sentiment = get_market_sentiment_score()
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("시장 심리 점수", f"{sentiment['score']}", sentiment['label'])
        with col2:
            st.metric("긍정", f"{sentiment['details'].get('긍정', 0)}개")
        with col3:
            st.metric("부정", f"{sentiment['details'].get('부정', 0)}개")

        st.divider()

        insights = get_latest_insights(10)
        if not insights:
            st.info("수집된 인사이트가 없습니다. youtube_collector.py를 먼저 실행해주세요.")
        else:
            for item in insights:
                insight = item.get("insight", {})
                sentiment_label = insight.get("market_sentiment", "중립")
                color = "🟢" if sentiment_label == "긍정" else "🔴" if sentiment_label == "부정" else "⚪"

                with st.expander(f"{color} {item['title'][:60]}... | {item['channel']}"):
                    st.write("**요약:**", insight.get("summary", "-"))
                    col1, col2 = st.columns(2)
                    with col1:
                        stocks = insight.get("key_stocks", [])
                        if stocks:
                            st.write("**언급 종목:**", ", ".join(stocks))
                        sectors = insight.get("key_sectors", [])
                        if sectors:
                            st.write("**언급 섹터:**", ", ".join(sectors))
                    with col2:
                        signals = insight.get("investment_signals", [])
                        if isinstance(signals, str):
                            signals = [signals]
                        elif not isinstance(signals, list):
                            signals = []
                        if signals:
                            st.write("**투자 신호:**")
                            for s in signals[:2]:
                                st.caption(f"• {s}")
                    st.link_button("유튜브에서 보기", item.get("url", "#"))
