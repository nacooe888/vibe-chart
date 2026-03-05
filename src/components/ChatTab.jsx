import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { loadChart } from "../lib/chartStorage";
import { supabase } from "../lib/supabase";
import { getSkyContext } from "./EnergyReport";
import { chatSystemPrompt } from "../lib/prompts";

const ACCENT = "#C49FFF";

async function claudeFetch(body) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export default function ChatTab() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const [natalChart, setNatalChart] = useState(null);
  const [transitChart, setTransitChart] = useState(null);
  // Refs so sendMessage always reads latest chart data without stale closure
  const natalRef = useRef(null);
  const transitRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;

    let natalDone = false;
    let transitDone = false;
    function checkReady() {
      if (natalDone && transitDone) setChartsReady(true);
    }

    loadChart(user.id, "natal").then(chart => {
      natalRef.current = chart;
      setNatalChart(chart);
      natalDone = true;
      checkReady();
    });

    // Check localStorage first for transits
    let transitFromCache = false;
    try {
      const raw = localStorage.getItem(`vibe_transit_${user.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - new Date(parsed.fetchedAt).getTime() < 60 * 60 * 1000) {
          transitRef.current = parsed;
          setTransitChart(parsed);
          transitDone = true;
          transitFromCache = true;
          checkReady();
        }
      }
    } catch (e) { /* ignore */ }

    if (!transitFromCache) {
      loadChart(user.id, "transits").then(chart => {
        transitRef.current = chart;
        setTransitChart(chart);
        transitDone = true;
        checkReady();
      });
    }
  }, [user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Always read from refs so we get latest chart data even if state hasn't re-rendered
    const skyContext = getSkyContext(natalRef.current, transitRef.current);

    try {
      const res = await claudeFetch({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: chatSystemPrompt(skyContext),
        messages: newMessages,
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text?.trim() || "Something went wrong — try again.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong — try again." }]);
    }
    setLoading(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#050510",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Cormorant Garamond', serif",
      color: "white",
      maxWidth: 500,
      margin: "0 auto",
      padding: "0 0 80px",
    }}>

      {/* Header */}
      <div style={{ padding: "48px 24px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 8, color: "rgba(255,255,255,0.25)" }}>
          {!chartsReady
            ? "loading your chart..."
            : natalChart && transitChart
              ? "natal chart · current transits loaded"
              : natalChart
                ? "natal chart loaded · no transits"
                : transitChart
                  ? "current transits loaded · no natal chart"
                  : "no chart · using demo sky"}
        </div>
        <h1 style={{ fontWeight: 300, fontSize: 34, margin: 0, letterSpacing: "0.06em" }}>ask your chart</h1>
        <div style={{ width: 36, height: 1, background: "rgba(255,255,255,0.1)", margin: "14px auto 0" }} />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ padding: "24px 0 8px" }}>
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontStyle: "italic", fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
              ask anything — what's active in your chart,<br />
              what a transit means, what's coming
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "What should I look out for today?",
                "How can I work with this energy in a positive way?",
                "What transits are most active for me right now?",
                "What does my chart say about what I'm going through?",
              ].map(q => (
                <button key={q} onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 0); }}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 14,
                    padding: "13px 18px",
                    color: "rgba(255,255,255,0.55)",
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 15,
                    textAlign: "left",
                    cursor: "pointer",
                    lineHeight: 1.5,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(196,159,255,0.08)"; e.currentTarget.style.borderColor = "rgba(196,159,255,0.3)"; e.currentTarget.style.color = "rgba(255,255,255,0.82)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div style={{
              maxWidth: "82%",
              padding: "12px 16px",
              borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              background: msg.role === "user" ? `${ACCENT}22` : "rgba(255,255,255,0.05)",
              border: `1px solid ${msg.role === "user" ? ACCENT + "44" : "rgba(255,255,255,0.08)"}`,
              fontSize: 15,
              lineHeight: 1.7,
              color: msg.role === "user" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.78)",
              fontStyle: msg.role === "assistant" ? "normal" : "normal",
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              padding: "12px 18px",
              borderRadius: "18px 18px 18px 4px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <div style={{ fontSize: 20, color: ACCENT, animation: "spin-slow 4s linear infinite", display: "inline-block" }}>✦</div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        position: "fixed",
        bottom: 80,
        left: 0,
        right: 0,
        padding: "10px 16px",
        background: "linear-gradient(to top, #050510 70%, transparent 100%)",
        zIndex: 30,
      }}>
        <div style={{
          maxWidth: 500,
          margin: "0 auto",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${input ? ACCENT + "55" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 18,
          padding: "8px 8px 8px 16px",
          transition: "border-color 0.2s",
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={chartsReady ? "ask your chart anything..." : "loading your chart..."}
            disabled={!chartsReady}
            rows={1}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "rgba(255,255,255,0.82)",
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 15,
              lineHeight: 1.6,
              resize: "none",
              caretColor: ACCENT,
              maxHeight: 120,
              overflowY: "auto",
            }}
            onInput={e => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading || !chartsReady}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              background: input.trim() && !loading ? ACCENT + "33" : "rgba(255,255,255,0.05)",
              color: input.trim() && !loading ? ACCENT : "rgba(255,255,255,0.2)",
              fontSize: 16,
              cursor: input.trim() && !loading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.2s",
            }}
          >
            ↑
          </button>
        </div>
        <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.15)", marginTop: 6, letterSpacing: "0.1em" }}>
          enter to send · shift+enter for new line
        </div>
      </div>
    </div>
  );
}
