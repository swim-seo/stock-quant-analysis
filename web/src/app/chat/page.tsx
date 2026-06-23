"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_QUESTIONS = [
  "오늘 사면 좋은 종목은?",
  "지금 시장 분위기 어때?",
  "유튜브에서 뭐가 언급됐어?",
  "가장 점수 높은 종목 알려줘",
  "지금 당장 진입할 종목 있어?",
];

function formatKST(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "안녕하세요! 주식 AI 어시스턴트입니다. 오늘의 매매 신호, 종목 분석, 유튜브 인사이트 등을 물어보세요.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addSystemMsg(content: string) {
    setMessages((prev) => [...prev, { role: "assistant", content }]);
  }

  async function handleRefresh() {
    if (refreshing || loading) return;
    setRefreshing(true);

    // 1. 유튜브 최신 업데이트 여부 확인
    const { data: ytData } = await supabase
      .from("youtube_insights")
      .select("processed_at")
      .order("processed_at", { ascending: false })
      .limit(1);

    const latestYt = ytData?.[0]?.processed_at;
    const nowKST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const ytDate = latestYt ? new Date(new Date(latestYt).toLocaleString("en-US", { timeZone: "Asia/Seoul" })) : null;
    const ytIsToday = ytDate
      ? ytDate.getFullYear() === nowKST.getFullYear() &&
        ytDate.getMonth() === nowKST.getMonth() &&
        ytDate.getDate() === nowKST.getDate()
      : false;

    const ytMsg = latestYt
      ? `📺 유튜브 최신 수집: **${formatKST(latestYt)}** ${ytIsToday ? "✅ 오늘 업데이트됨" : "⚠️ 오늘 업데이트 없음"}`
      : "📺 유튜브 데이터 없음";

    addSystemMsg(`${ytMsg}\n\n⏳ 주가·팩터·신호 재계산 중... (Claude 토큰 사용 없음)`);

    // 2. prices 모드 트리거 (주가 + 팩터 + 신호 재계산)
    try {
      const res = await fetch("/api/trigger-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "prices" }),
      });
      const data = await res.json();
      if (res.ok) {
        addSystemMsg("✅ 주가·신호 재계산 시작됨! Railway에서 약 2~3분 소요됩니다.\n완료 후 페이지 새로고침하면 최신 데이터가 반영됩니다.");
      } else {
        addSystemMsg(`⚠️ 트리거 실패: ${data?.error ?? "알 수 없는 오류"}\n\n Railway 서비스가 이미 실행 중이거나 설정이 없을 수 있습니다.`);
      }
    } catch {
      addSystemMsg("❌ 파이프라인 트리거 연결 실패. PIPELINE_TRIGGER_URL 설정을 확인해주세요.");
    } finally {
      setRefreshing(false);
    }
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const history = messages.filter((m) => m.role !== "assistant" || messages.indexOf(m) > 0);

    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantText };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "오류가 발생했습니다. 다시 시도해주세요.",
        };
        return updated;
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        background: "#0a0a0a", color: "#fff", padding: "16px 24px",
        display: "flex", alignItems: "center", gap: 16,
        borderBottom: "1px solid #222",
      }}>
        <Link href="/" style={{ color: "#888", textDecoration: "none", fontSize: 14 }}>← 대시보드</Link>
        <span style={{ fontSize: 18, fontWeight: 800 }}>💬 주식 AI 어시스턴트</span>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          title="유튜브 최신 여부 확인 후 주가·신호 재계산 (토큰 사용 없음)"
          style={{
            marginLeft: "auto",
            fontSize: 12, padding: "4px 12px", borderRadius: 20,
            border: "1px solid #444", background: refreshing ? "#333" : "#1a1a1a",
            color: refreshing ? "#888" : "#0f0",
            cursor: refreshing || loading ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {refreshing ? "⏳ 갱신 중..." : "🔄 데이터 새로고침"}
        </button>
      </div>

      {/* Quick questions */}
      <div style={{ padding: "12px 24px", background: "#fff", borderBottom: "1px solid #eee", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={loading}
            style={{
              fontSize: 13, padding: "6px 14px", borderRadius: 20,
              border: "1px solid #ddd", background: "#f5f5f5",
              cursor: loading ? "not-allowed" : "pointer",
              color: "#333", whiteSpace: "nowrap",
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 800, width: "100%", margin: "0 auto" }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div style={{
              maxWidth: msg.role === "user" ? "80%" : "90%",
              padding: "12px 16px",
              borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              background: msg.role === "user" ? "#0066ff" : "#fff",
              color: msg.role === "user" ? "#fff" : "#111",
              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
              fontSize: 15,
              lineHeight: 1.6,
              wordBreak: "break-word",
            }}>
              {msg.role === "user" ? (
                <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
              ) : msg.content === "" && loading ? (
                <span style={{ color: "#999" }}>▌</span>
              ) : (
                <div className="md-body">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        background: "#fff", borderTop: "1px solid #eee", padding: "16px 24px",
        display: "flex", gap: 12, alignItems: "flex-end",
        maxWidth: 800, width: "100%", margin: "0 auto", boxSizing: "border-box",
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="종목 추천, 매도 타이밍, 시장 분위기... 뭐든 물어보세요 (Enter 전송)"
          rows={1}
          disabled={loading}
          style={{
            flex: 1, padding: "12px 16px", borderRadius: 12,
            border: "1px solid #ddd", fontSize: 15, resize: "none",
            outline: "none", fontFamily: "inherit", lineHeight: 1.5,
            background: loading ? "#f5f5f5" : "#fff",
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          style={{
            padding: "12px 20px", borderRadius: 12, border: "none",
            background: loading || !input.trim() ? "#ddd" : "#0066ff",
            color: "#fff", fontWeight: 700, fontSize: 15,
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "..." : "전송"}
        </button>
      </div>
    </div>
  );
}
