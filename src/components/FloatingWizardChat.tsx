import { useRef, useEffect, useState } from "react";
import { useWizardBackground } from "@/contexts/WizardBackgroundContext";
import { Sparkles, Send, Trash2, User, Bot, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { triggerHapticSelection, triggerHapticSuccess } from "@/lib/haptics";
import wizardAvatar from "@/assets/wizard-logo.png";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { supabase } from "@/integrations/supabase/client";

export function FloatingWizardChat() {
  const { messages, isLoading, sendMessage, clearChat } = useWizardBackground();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <>
      {/* Floating button — hidden when panel is open */}
      {!open && (
        <button
          onClick={() => { triggerHapticSelection(); setOpen(true); }}
          className="fixed bottom-24 right-4 z-[10000] w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform duration-150 md:hidden"
          aria-label="Open AI Wizard"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[10001] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[10002] flex flex-col glass-card bg-background/95 backdrop-blur-xl border-t border-border/50 rounded-t-3xl animate-in slide-in-from-bottom duration-300"
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
                <div className="w-10 h-10 rounded-full glass-card border-primary/20 p-0.5 overflow-hidden">
                  <img src={wizardAvatar} alt="Wizard" className="w-full h-full object-cover rounded-full mix-blend-screen" />
                </div>
                <Sparkles className="h-3 w-3 text-primary absolute -bottom-1 -right-1 drop-shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">Weight Cut Wizard</h2>
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
                  className="h-8 w-8 rounded-xl glass-card border-border/30 text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all"
                  title="Clear chat history"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                  className="h-8 w-8 rounded-xl glass-card border-border/30 text-muted-foreground hover:text-foreground transition-all"
                  title="Close"
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
                  <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/15" : "glass-card border-secondary/15"}`}>
                    {msg.role === "user" ? <User className="h-4 w-4 text-primary drop-shadow-[0_0_4px_rgba(6,182,212,0.5)]" /> : <Bot className="h-4 w-4 text-secondary drop-shadow-[0_0_4px_rgba(168,85,247,0.5)]" />}
                  </div>

                  {msg.role === "user" ? (
                    <div className="px-3.5 py-2.5 rounded-2xl text-sm bg-gradient-to-br from-primary/90 via-primary/80 to-accent/70 text-primary-foreground rounded-tr-sm shadow-lg shadow-primary/25 border border-primary/20">
                      <div className="prose dark:prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="relative px-3.5 py-2.5 rounded-2xl text-sm glass-card text-card-foreground rounded-tl-sm border-secondary/15 bg-gradient-to-br from-secondary/5 to-accent/5">
                      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={1} />
                      <div className="relative z-10 prose dark:prose-invert prose-sm max-w-none">
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
                  <div className="shrink-0 h-8 w-8 rounded-full glass-card border-secondary/15 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-secondary drop-shadow-[0_0_4px_rgba(168,85,247,0.5)]" />
                  </div>
                  <div className="relative px-3.5 py-2.5 rounded-2xl glass-card rounded-tl-sm border-secondary/15 bg-gradient-to-br from-secondary/5 to-accent/5 flex items-center gap-2">
                    <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={1} />
                    <Loader2 className="relative z-10 h-4 w-4 text-accent animate-spin drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
                    <span className="relative z-10 text-xs text-muted-foreground animate-pulse">Wizard is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========== INPUT BAR ========== */}
          <div
            className="shrink-0 border-t border-border/10 bg-background/95 backdrop-blur-xl px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
          >
            <form onSubmit={handleSend} className="relative flex items-center gap-2">
              <div className="relative flex-1 rounded-2xl glass-card border-primary/15 bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5 overflow-hidden">
                <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={1} />
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask your nutritionist..."
                  disabled={isLoading}
                  className="relative z-10 w-full h-11 rounded-2xl bg-transparent px-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none border-none disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 disabled:opacity-40 active:scale-95 transition-all duration-200"
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
