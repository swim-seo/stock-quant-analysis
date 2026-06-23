"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        <span style={{
          marginLeft: "auto", fontSize: 12, background: "#1a1a1a",
          border: "1px solid #333", padding: "4px 10px", borderRadius: 20, color: "#0f0",
        }}>● 실시간 신호 연동</span>
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
