import { useRef, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { useWizardBackground } from "@/contexts/WizardBackgroundContext";
import { Sparkles, Send, Trash2, User, Bot, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { triggerHapticSelection, triggerHapticSuccess } from "@/lib/haptics";
import wizardAvatar from "@/assets/wizard-logo.png";

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
            <img src={wizardAvatar} alt="Wizard" className="w-10 h-10 object-cover rounded-full border border-primary/20" />
            <Sparkles className="h-3 w-3 text-primary absolute -bottom-1 -right-1" />
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-safe" ref={scrollRef}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div className={`flex gap-2 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar Icon */}
              <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-primary/20" : "bg-card border border-white/10"}`}>
                {msg.role === "user" ? <User className="h-4 w-4 text-primary" /> : <Bot className="h-4 w-4 text-secondary" />}
              </div>

              {/* Message Bubble */}
              <div className={`p-3 rounded-2xl text-sm ${msg.role === "user" ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-tr-sm" : "bg-card/80 border border-white/10 text-card-foreground rounded-tl-sm backdrop-blur-md"}`}>
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div className="flex gap-2 max-w-[85%]">
              <div className="shrink-0 h-8 w-8 rounded-full bg-card border border-white/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-secondary" />
              </div>
              <div className="p-3 rounded-2xl bg-card/80 border border-white/10 rounded-tl-sm backdrop-blur-md flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                <span className="text-xs text-muted-foreground animate-pulse">Wizard is thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-none p-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] bg-background/80 backdrop-blur-md border-t border-border/20">
        <form onSubmit={handleSend} className="flex gap-2 relative">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your nutritionist..."
            className="rounded-full bg-card/50 border-white/10 pr-12 focus-visible:ring-primary/50"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-1 top-1 bottom-1 h-8 w-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200"
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4 ml-0.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
