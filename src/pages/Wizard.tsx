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
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <div className="flex-none pt-[calc(env(safe-area-inset-top)+1rem)] px-4 pb-4 border-b border-border/20 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={wizardAvatar} alt="Wizard" className="w-10 h-10 object-cover rounded-full border border-primary/20 mix-blend-screen" />
            <Sparkles className="h-3 w-3 text-primary absolute -bottom-1 -right-1 drop-shadow-md" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Weight Cut Wizard</h1>
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
              className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
              title="Clear chat history"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-safe" ref={scrollRef}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div className={`flex gap-2 max-w-[88%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar Icon */}
              <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-primary/20" : "glass-card border-none"}`}>
                {msg.role === "user" ? <User className="h-4 w-4 text-primary drop-shadow-md" /> : <Bot className="h-4 w-4 text-secondary drop-shadow-md" />}
              </div>

              {/* Message Bubble */}
              {msg.role === "user" ? (
                <div className={`px-3 py-2 rounded-2xl text-sm bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-tr-sm shadow-lg shadow-primary/20`}>
                  <div className="prose dark:prose-invert prose-sm max-w-none">
                    <ReactMarkdown>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="relative px-3 py-2 rounded-2xl text-sm glass-card text-card-foreground rounded-tl-sm border-border/30">
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
              <div className="shrink-0 h-8 w-8 rounded-full glass-card border-none flex items-center justify-center">
                <Bot className="h-4 w-4 text-secondary drop-shadow-md" />
              </div>
              <div className="relative px-3 py-2 rounded-2xl glass-card rounded-tl-sm border-border/30 flex items-center gap-2">
                <GlowingEffect
                  spread={40}
                  glow={true}
                  disabled={false}
                  proximity={64}
                  inactiveZone={0.01}
                  borderWidth={1}
                />
                <Loader2 className="relative z-10 h-4 w-4 text-primary animate-spin drop-shadow-md" />
                <span className="relative z-10 text-xs text-muted-foreground animate-pulse">Wizard is thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-none p-4 pb-[calc(env(safe-area-inset-bottom)+4rem)] bg-background/80 backdrop-blur-md border-t border-border/30">
        <form onSubmit={handleSend} className="flex gap-2 relative z-10">
          <div className="relative flex-1 rounded-full">
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
              className="relative z-10 w-full rounded-full bg-muted/50 border-border/30 pr-12 focus-visible:ring-primary/50 text-foreground placeholder:text-muted-foreground"
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="absolute right-1 top-1 bottom-1 h-8 w-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 z-20"
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4 ml-0.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
