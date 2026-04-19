import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Brain, Loader2, Mic, MicOff, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { AIPersistence } from "@/lib/aiPersistence";
import { triggerHapticSelection } from "@/lib/haptics";
import { logger } from "@/lib/logger";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

interface RecoveryCoachChatProps {
  userId: string;
  userName?: string | null;
}

const STORAGE_KEY = "recovery_coach_session";

const PROMPT_CHIPS = [
  "My shoulders are tight after sparring.",
  "I feel drained today.",
  "Can I spar tomorrow?",
  "Suggest a recovery day plan.",
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function RecoveryCoachChat({ userId, userName }: RecoveryCoachChatProps) {
  const { checkAIAccess, openNoGemsDialog, handleAILimitError, onAICallSuccess } = useSubscription();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const cached = AIPersistence.load(userId, STORAGE_KEY) as Msg[] | null;
    if (cached && Array.isArray(cached) && cached.length > 0) {
      setMessages(cached);
    }
  }, [userId]);

  // Persist on every change
  useEffect(() => {
    if (messages.length === 0) return;
    AIPersistence.save(userId, STORAGE_KEY, messages, 24);
  }, [userId, messages]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Edge function warmup
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recovery-coach`, {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {});
      } catch {
        // Ignore warmup errors
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Cleanup any in-flight request on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  // Voice dictation — same UX as the add-meal flow on Nutrition page
  const handleVoiceTranscript = useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text).trim());
  }, []);
  const handleVoiceError = useCallback(
    (error: string) => toast({ title: "Voice Input", description: error, variant: "destructive" }),
    [toast],
  );
  const {
    isListening,
    isSupported: voiceSupported,
    startListening,
    stopListening,
    interimText,
  } = useSpeechRecognition({ onTranscript: handleVoiceTranscript, onError: handleVoiceError });

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    if (isListening) stopListening();

    if (!checkAIAccess()) {
      openNoGemsDialog();
      return;
    }

    const userMsg: Msg = { id: newId(), role: "user", content: trimmed, createdAt: Date.now() };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    setSending(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");

      const apiHistory = nextHistory.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recovery-coach`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: apiHistory, userName: userName ?? null }),
      });

      if (!res.ok) {
        const rawBody = await res.text();
        let body: { error?: string; code?: string; message?: string } = {};
        try {
          body = JSON.parse(rawBody);
        } catch {
          // non-JSON response — keep raw for diagnostic
        }
        logger.error("recovery-coach non-OK response", { status: res.status, body, rawBody });
        if (res.status === 429 && body?.code === "NO_GEMS") {
          await handleAILimitError({ context: { status: 429, json: () => Promise.resolve(body) } });
          setMessages(messages);
          return;
        }
        if (res.status === 404) {
          throw new Error("Coach endpoint not deployed yet.");
        }
        const serverMsg = body?.error || body?.message || rawBody.slice(0, 200) || `HTTP ${res.status}`;
        throw new Error(serverMsg);
      }

      const data = await res.json();
      const assistantText: string = data?.choices?.[0]?.message?.content ?? "";
      if (!assistantText) throw new Error("Empty response");

      onAICallSuccess();
      const assistantMsg: Msg = {
        id: newId(),
        role: "assistant",
        content: assistantText,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e?.name === "AbortError") return;
      logger.error("recovery-coach send failed", err);
      toast({
        title: "Coach unavailable",
        description: e?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
      setMessages(messages);
    } finally {
      setSending(false);
    }
  }, [
    input,
    sending,
    isListening,
    stopListening,
    checkAIAccess,
    openNoGemsDialog,
    messages,
    userName,
    handleAILimitError,
    onAICallSuccess,
    toast,
  ]);

  const clearChat = useCallback(() => {
    triggerHapticSelection();
    abortRef.current?.abort();
    setMessages([]);
    AIPersistence.remove(userId, STORAGE_KEY);
  }, [userId]);

  const isEmpty = messages.length === 0;
  const sendDisabled = sending || input.trim().length === 0;

  const composedTextareaValue = useMemo(() => {
    if (!isListening || !interimText) return input;
    return input ? `${input} ${interimText}` : interimText;
  }, [input, isListening, interimText]);

  return (
    <div className="card-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Recovery Coach</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">1 gem per message</span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              className="h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground/60 active:text-destructive active:bg-destructive/10 transition-colors"
              aria-label="Clear chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="px-3 py-3 space-y-3 max-h-[440px] overflow-y-auto scroll-smooth [-webkit-overflow-scrolling:touch]">
        {isEmpty && (
          <div className="space-y-3 py-2">
            <p className="text-[13px] text-muted-foreground/80 leading-relaxed px-1">
              Tell me how you're feeling — sore spots, sleep, energy, anything bothering you. I'll factor in your
              recent training load and suggest a session that fits.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    triggerHapticSelection();
                    setInput(chip);
                    textareaRef.current?.focus();
                  }}
                  className="text-[11px] px-2.5 py-1.5 rounded-full bg-muted/40 active:bg-muted/60 border border-border/40 text-foreground/80 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}

        {sending && (
          <div className="flex items-center gap-2 text-muted-foreground/80 text-[12px] pl-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking...
          </div>
        )}
      </div>

      {/* Input footer */}
      <div className="border-t border-border/40 px-3 py-2.5 space-y-1.5">
        {isListening && interimText && (
          <p className="text-[12px] text-muted-foreground/70 italic px-1">{interimText}</p>
        )}
        <div className="flex items-end gap-1.5">
          {voiceSupported && (
            <button
              type="button"
              onClick={() => {
                triggerHapticSelection();
                if (isListening) stopListening();
                else startListening();
              }}
              disabled={sending}
              className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-xl transition-colors ${
                isListening
                  ? "bg-red-500/15 text-red-400"
                  : "bg-muted/40 text-muted-foreground active:bg-muted/60"
              }`}
              aria-label={isListening ? "Stop listening" : "Start voice input"}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={composedTextareaValue}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={isListening ? "Listening..." : "Describe how you feel..."}
            rows={1}
            className={`flex-1 min-h-[36px] max-h-[140px] resize-none rounded-xl border border-border/40 bg-muted/20 py-2 px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40 ${
              isListening ? "border-red-500/30" : ""
            }`}
            disabled={sending}
          />
          <button
            type="button"
            onClick={send}
            disabled={sendDisabled}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  const clean = content.replace(/\u2014/g, " - ").replace(/\u2013/g, "-");
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? "bg-primary/15 text-foreground"
            : "bg-muted/40 text-foreground"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{clean}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_li]:my-0.5 [&_strong]:text-primary">
            <ReactMarkdown>{clean}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
