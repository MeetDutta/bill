"use client";

import { useState } from "react";
import { copilotApi } from "@/services/api";
import { Sparkles, X, Send, Bot, User, ArrowRight, Lightbulb, TrendingUp, AlertTriangle } from "lucide-react";

interface CopilotResponse {
  answer: string;
  category?: string;
  recommended_action?: string;
  data_context?: Record<string, unknown>;
}

export function CopilotDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ sender: "user" | "copilot"; text: string; action?: string }>
  >([
    {
      sender: "copilot",
      text: "Hello! I am your AI Business Copilot. Ask me anything about your sales, at-risk customers, campaign ROI, product trends, or what actions you should take today.",
    },
  ]);

  const quickPrompts = [
    "What should I do today?",
    "Who is at risk of churning?",
    "What happened to sales this month?",
    "Which campaign had the best ROI?",
  ];

  const handleSend = async (questionText?: string) => {
    const textToSend = questionText || query;
    if (!textToSend.trim()) return;

    setMessages((prev) => [...prev, { sender: "user", text: textToSend }]);
    if (!questionText) setQuery("");
    setLoading(true);

    try {
      const res = await copilotApi.query(textToSend);
      const data: CopilotResponse = res.data;
      setMessages((prev) => [
        ...prev,
        {
          sender: "copilot",
          text: data.answer,
          action: data.recommended_action,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          sender: "copilot",
          text: "I was unable to retrieve that information right now. Please verify your connection or try a different question.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:shadow-indigo-500/25 transition-all hover:scale-105 active:scale-95"
      >
        <Sparkles className="h-5 w-5 animate-pulse" />
        <span>Ask Copilot</span>
      </button>

      {/* Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in">
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-l border-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 p-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-sm">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    AI Business Copilot
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                      V2 Intelligence
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">Real-time verified business assistant</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Prompts Bar */}
            <div className="border-b border-slate-100 bg-slate-50/50 p-3">
              <p className="mb-2 text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Quick questions:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(p)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 transition shadow-2xs"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 text-sm ${m.sender === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      m.sender === "user"
                        ? "bg-slate-900 text-white"
                        : "bg-gradient-to-tr from-indigo-600 to-purple-600 text-white"
                    }`}
                  >
                    {m.sender === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-2xl p-3.5 ${
                      m.sender === "user"
                        ? "bg-indigo-600 text-white rounded-br-xs"
                        : "bg-slate-100 text-slate-800 rounded-bl-xs"
                    }`}
                  >
                    <p className="whitespace-pre-line text-xs sm:text-sm leading-relaxed">{m.text}</p>
                    {m.action && (
                      <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
                        <ArrowRight className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Recommended: {m.action}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-3.5 text-slate-500 rounded-bl-xs flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-indigo-600 animate-bounce" />
                    <div className="h-2 w-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.15s]" />
                    <div className="h-2 w-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.3s]" />
                    <span className="text-xs">Analyzing business data...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Form */}
            <div className="border-t border-slate-200 p-3 bg-white">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask about sales, churn, offers, health..."
                  className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="rounded-xl bg-indigo-600 p-2.5 text-white hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <p className="mt-1 text-center text-[10px] text-slate-400">
                🔒 Tenant-isolated • Powered by verified database metrics
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
