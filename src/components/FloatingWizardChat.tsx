import { useRef, useEffect, useState, useCallback } from "react";
import { useWizardBackground } from "@/contexts/WizardBackgroundContext";
import { Sparkles, Send, Trash2, User, Bot, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { triggerHapticSelection, triggerHapticSuccess, triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import wizardAvatar from "@/assets/wizard-logo.webp";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";

const FAB_SIZE = 48;
const EDGE_MARGIN = 16;
const SNAP_SPRING = "transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)";
const FAB_POS_KEY = "wcw_fab_position";

function loadSavedPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function FloatingWizardChat() {
  const { messages, isLoading, sendMessage, clearChat } = useWizardBackground();
  const { isPremium, gems, openNoGemsDialog } = useSubscription();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAccess = isPremium || gems > 0;

  // Drag state — all refs for 60fps performance (no React re-renders during drag)
  const fabRef = useRef<HTMLButtonElement>(null);
  const dragState = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    startTouchX: 0,
    startTouchY: 0,
    moved: false,
  });
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Initialize + restore position (runs on mount AND when chat closes)
  useEffect(() => {
    if (open) return; // Don't reposition while chat is open
    const saved = loadSavedPosition();
    const defaultY = window.innerHeight - FAB_SIZE - 88 - 20;
    if (saved) {
      posRef.current = { x: Math.min(saved.x, window.innerWidth - FAB_SIZE - EDGE_MARGIN), y: Math.min(saved.y, defaultY) };
    } else if (posRef.current.x === 0 && posRef.current.y === 0) {
      posRef.current = { x: window.innerWidth - FAB_SIZE - EDGE_MARGIN, y: defaultY };
    }
    if (fabRef.current) {
      fabRef.current.style.transition = "none";
      fabRef.current.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px)`;
    }
  }, [open]);

  const snapToEdge = useCallback(() => {
    const el = fabRef.current;
    if (!el) return;
    const { x, y } = posRef.current;
    const midX = window.innerWidth / 2;
    const snappedX = x + FAB_SIZE / 2 < midX ? EDGE_MARGIN : window.innerWidth - FAB_SIZE - EDGE_MARGIN;
    const clampedY = Math.max(60, Math.min(y, window.innerHeight - FAB_SIZE - 80));
    posRef.current = { x: snappedX, y: clampedY };
    el.style.transition = SNAP_SPRING;
    el.style.transform = `translate(${snappedX}px, ${clampedY}px)`;
    try { localStorage.setItem(FAB_POS_KEY, JSON.stringify(posRef.current)); } catch {}
    setTimeout(() => { if (el) el.style.transition = "none"; }, 350);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const { x, y } = posRef.current;
    dragState.current = { isDragging: true, startX: x, startY: y, startTouchX: touch.clientX, startTouchY: touch.clientY, moved: false };
    if (fabRef.current) {
      fabRef.current.style.transition = "none";
      fabRef.current.style.transform = `translate(${x}px, ${y}px) scale(1.08)`;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragState.current.isDragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragState.current.startTouchX;
    const dy = touch.clientY - dragState.current.startTouchY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragState.current.moved = true;
    const nx = Math.max(0, Math.min(dragState.current.startX + dx, window.innerWidth - FAB_SIZE));
    const ny = Math.max(40, Math.min(dragState.current.startY + dy, window.innerHeight - FAB_SIZE - 60));
    posRef.current = { x: nx, y: ny };
    if (fabRef.current) fabRef.current.style.transform = `translate(${nx}px, ${ny}px) scale(1.08)`;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!dragState.current.isDragging) return;
    dragState.current.isDragging = false;
    if (fabRef.current) fabRef.current.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px) scale(1)`;
    if (!dragState.current.moved) {
      // Tap — open chat
      handleFabPress();
    } else {
      // Drag ended — snap to nearest edge
      triggerHaptic(ImpactStyle.Light);
      snapToEdge();
    }
  }, [snapToEdge]);

  // Edge function warmup on mount
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wizard-chat`, {
            method: "GET",
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).catch(() => {});
        }
      } catch {}
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleClearChat = () => {
    triggerHapticSelection();
    clearChat();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    triggerHapticSelection();
    const currentInput = input;
    setInput("");
    await sendMessage(currentInput);
    triggerHapticSuccess();
  };

  const handleFabPress = () => {
    triggerHapticSelection();
    // Always open the chat — gem is only deducted when user sends a message
    setOpen(true);
  };

  return (
    <>
      {/* Floating button — draggable, snaps to edges. Always mounted to preserve position. */}
      <button
        ref={fabRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-tutorial="wizard-chat"
        className={`fixed top-0 left-0 z-[10000] w-12 h-12 rounded-full shadow-lg flex items-center justify-center md:hidden touch-none ${
          hasAccess
            ? "bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-primary/30"
            : "bg-zinc-800 text-zinc-400 shadow-none border border-white/10"
        } ${open ? "pointer-events-none opacity-0" : "opacity-100"}`}
        style={{ willChange: "transform", transition: open ? "opacity 0.15s" : undefined }}
        aria-label="Open AI Wizard"
        aria-hidden={open}
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[10001] bg-black/60 animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[10002] flex flex-col card-surface bg-background/98 border-t border-border rounded-t-3xl animate-in slide-in-from-bottom duration-300"
          style={{ height: "85dvh" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
          </div>

          {/* Header */}
          <div className="shrink-0 px-4 pb-4 border-b border-primary/15 bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full card-surface border-primary/20 p-0.5 overflow-hidden">
                  <img src={wizardAvatar} alt="Wizard" className="w-full h-full object-cover rounded-full mix-blend-screen" />
                </div>
                <Sparkles className="h-3 w-3 text-primary absolute -bottom-1 -right-1 drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">FightCamp Wizard</h2>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  AI Coach Online
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearChat}
                  className="h-8 w-8 rounded-xl card-surface border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all"
                  title="Clear chat history"
                  aria-label="Clear chat"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                  className="h-8 w-8 rounded-xl card-surface border-border text-muted-foreground hover:text-foreground transition-all"
                  title="Close"
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3" ref={scrollRef}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
              >
                <div className={`flex gap-2 max-w-[88%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/15" : "card-surface border-secondary/15"}`}>
                    {msg.role === "user" ? <User className="h-4 w-4 text-primary drop-shadow-[0_0_4px_hsl(var(--primary)/0.5)]" /> : <Bot className="h-4 w-4 text-secondary drop-shadow-[0_0_4px_hsl(var(--primary)/0.4)]" />}
                  </div>

                  {msg.role === "user" ? (
                    <div className="px-3.5 py-2.5 rounded-2xl text-sm bg-gradient-to-br from-primary/90 via-primary/80 to-accent/70 text-primary-foreground rounded-tr-sm shadow-lg shadow-primary/25 border border-primary/20">
                      <div className="wizard-prose max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="relative px-3.5 py-2.5 rounded-xl text-sm card-surface text-card-foreground rounded-tl-sm border-secondary/15 bg-gradient-to-br from-secondary/5 to-accent/5">
                      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={1} />
                      <div className="relative z-10 wizard-prose max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start animate-fade-in">
                <div className="flex gap-2 max-w-[88%]">
                  <div className="shrink-0 h-8 w-8 rounded-full card-surface border-secondary/15 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-secondary drop-shadow-[0_0_4px_hsl(var(--primary)/0.4)]" />
                  </div>
                  <div className="relative px-3.5 py-2.5 rounded-xl card-surface rounded-tl-sm border-secondary/15 bg-gradient-to-br from-secondary/5 to-accent/5 flex items-center gap-2">
                    <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={1} />
                    <Loader2 className="relative z-10 h-4 w-4 text-accent animate-spin drop-shadow-[0_0_6px_hsl(var(--primary)/0.4)]" />
                    <span className="relative z-10 text-xs text-muted-foreground animate-pulse">Wizard is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========== INPUT BAR ========== */}
          <div
            className="shrink-0 border-t border-border/10 bg-background/95 px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
          >
            <form onSubmit={handleSend} className="relative flex items-center gap-2">
              <div className="relative flex-1 rounded-xl card-surface border-primary/15 bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5 overflow-hidden">
                <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={1} />
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask your nutritionist..."
                  disabled={isLoading}
                  className="relative z-10 w-full h-11 rounded-xl bg-transparent px-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none border-none disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
                className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 disabled:opacity-40 active:scale-95 transition-all duration-200"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
