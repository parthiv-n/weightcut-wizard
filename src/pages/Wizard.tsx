import { useRef, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { useWizardBackground } from "@/contexts/WizardBackgroundContext";
import { Sparkles, Send, Trash2, User, Bot, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { triggerHapticSelection, triggerHapticSuccess } from "@/lib/haptics";
import wizardAvatar from "@/assets/wizard-logo.png";
import { GlowingEffect } from "@/components/ui/glowing-effect";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export default function Wizard() {
  const { userId } = useUser();
  const { messages, isLoading, sendMessage, clearChat } = useWizardBackground();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load chat history on mount - This logic is now handled by useWizardBackground
  // useEffect(() => {
  //   if (userId) {
  //     const history = localStorage.getItem(`wizard_chat_history_${ userId } `);
  //     if (history) {
  //       setMessages(JSON.parse(history));
  //     } else {
  //       // Initial greeting
  //       setMessages([
  //         { role: "assistant", content: "Hey champ! I'm the Weight Cut Wizard. How can I help you dial in your nutrition and weight today?" }
  //       ]);
  //     }
  //   }
  // }, [userId]);

  const handleClearChat = () => {
    triggerHapticSelection();
    clearChat(); // Call clearChat from context
  };

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    triggerHapticSelection();

    const currentInput = input;
    setInput("");

    // Message sending logic moved to context
    await sendMessage(currentInput);
    triggerHapticSuccess();
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-none pt-[calc(env(safe-area-inset-top)+1rem)] px-4 pb-4 border-b border-primary/15 bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full glass-card border-primary/20 p-0.5 overflow-hidden">
              <img src={wizardAvatar} alt="Wizard" className="w-full h-full object-cover rounded-full mix-blend-screen" />
            </div>
            <Sparkles className="h-3 w-3 text-primary absolute -bottom-1 -right-1 drop-shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">Weight Cut Wizard</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              AI Coach Online
            </p>
          </div>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearChat}
              className="h-8 w-8 rounded-xl glass-card border-border/30 text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all"
              title="Clear chat history"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3 pb-3" ref={scrollRef}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div className={`flex gap-2 max-w-[88%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar Icon */}
              <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/15" : "glass-card border-secondary/15"}`}>
                {msg.role === "user" ? <User className="h-4 w-4 text-primary drop-shadow-[0_0_4px_rgba(6,182,212,0.5)]" /> : <Bot className="h-4 w-4 text-secondary drop-shadow-[0_0_4px_rgba(168,85,247,0.5)]" />}
              </div>

              {/* Message Bubble */}
              {msg.role === "user" ? (
                <div className="px-3.5 py-2.5 rounded-2xl text-sm bg-gradient-to-br from-primary/90 via-primary/80 to-accent/70 text-primary-foreground rounded-tr-sm shadow-lg shadow-primary/25 border border-primary/20">
                  <div className="prose dark:prose-invert prose-sm max-w-none">
                    <ReactMarkdown>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="relative px-3.5 py-2.5 rounded-2xl text-sm glass-card text-card-foreground rounded-tl-sm border-secondary/15 bg-gradient-to-br from-secondary/5 to-accent/5">
                  <GlowingEffect
                    spread={40}
                    glow={true}
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                    borderWidth={1}
                  />
                  <div className="relative z-10 prose dark:prose-invert prose-sm max-w-none">
                    <ReactMarkdown>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div className="flex gap-2 max-w-[88%]">
              <div className="shrink-0 h-8 w-8 rounded-full glass-card border-secondary/15 flex items-center justify-center">
                <Bot className="h-4 w-4 text-secondary drop-shadow-[0_0_4px_rgba(168,85,247,0.5)]" />
              </div>
              <div className="relative px-3.5 py-2.5 rounded-2xl glass-card rounded-tl-sm border-secondary/15 bg-gradient-to-br from-secondary/5 to-accent/5 flex items-center gap-2">
                <GlowingEffect
                  spread={40}
                  glow={true}
                  disabled={false}
                  proximity={64}
                  inactiveZone={0.01}
                  borderWidth={1}
                />
                <Loader2 className="relative z-10 h-4 w-4 text-accent animate-spin drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
                <span className="relative z-10 text-xs text-muted-foreground animate-pulse">Wizard is thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area — pinned to bottom */}
      <div className="flex-none p-4 pb-[calc(env(safe-area-inset-bottom)+4rem)] border-t border-border/10 bg-background/95 backdrop-blur-xl">
        <form onSubmit={handleSend} className="relative">
          <div className="relative rounded-2xl glass-card border-primary/15 bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5 overflow-hidden">
            <GlowingEffect
              spread={40}
              glow={true}
              disabled={false}
              proximity={64}
              inactiveZone={0.01}
              borderWidth={1}
            />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your nutritionist..."
              className="relative z-10 w-full rounded-2xl bg-transparent border-none pr-12 focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground placeholder:text-muted-foreground/60 h-11"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground transition-all duration-200 z-20 shadow-lg shadow-primary/20"
              disabled={!input.trim() || isLoading}
            >
              <Send className="h-4 w-4 ml-0.5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
