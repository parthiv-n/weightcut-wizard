import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, Sparkles, Trash2 } from "lucide-react";
import wizardAvatar from "@/assets/wizard-logo.png";
import wizardThinking from "@/assets/wizard-thinking.png";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Wizard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userName, setUserName] = useState("fighter");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadChatHistory();
    loadUserName();
  }, []);

  const loadUserName = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const emailName = user.email?.split("@")[0] || "fighter";
      const formattedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
      setUserName(formattedName);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadChatHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(50);

    if (data) {
      const chatMessages = data.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));
      setMessages(chatMessages);
    }
  };

  const saveMessage = async (role: "user" | "assistant", content: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("chat_messages").insert({
      user_id: user.id,
      role,
      content,
    });
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);

    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    await saveMessage("user", userMessage);

    // Add thinking indicator
    setMessages([...newMessages, { role: "assistant", content: "🔮 The Wizard is thinking..." }]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      const userData = profile ? {
        currentWeight: profile.current_weight_kg,
        goalWeight: profile.goal_weight_kg,
        daysToWeighIn: Math.ceil(
          (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        ),
      } : null;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wizard-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages,
            userData,
          }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error("Failed to get response");
      }

      setIsSpeaking(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantMessage += content;
              setMessages([...newMessages, { role: "assistant", content: assistantMessage }]);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      if (assistantMessage) {
        await saveMessage("assistant", assistantMessage);
      }
      setIsSpeaking(false);
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to get response from the Wizard",
        variant: "destructive",
      });
      setIsSpeaking(false);
    }

    setLoading(false);
  };

  const clearChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("chat_messages").delete().eq("user_id", user.id);
    setMessages([]);
    toast({ title: "Chat cleared", description: "Starting fresh conversation" });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">AI Wizard Bot</h1>
            <p className="text-muted-foreground mt-2">Your mystical, science-based weight cut coach</p>
          </div>
          <Button variant="outline" size="icon" onClick={clearChat}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <Card className="border-border/50">
          <CardContent className="p-6">
            <div className="flex flex-col items-center mb-6">
              <div
                className={`relative transition-all duration-300 ${
                  isSpeaking ? "scale-110 animate-pulse" : ""
                }`}
              >
                <img
                  src={wizardAvatar}
                  alt="Weight Cut Wizard"
                  className="w-48 h-48"
                />
                {isSpeaking && (
                  <div className="absolute -inset-2 bg-primary/20 animate-ping" />
                )}
              </div>
              <div className="text-center mt-4">
                <h2 className="text-xl font-bold flex items-center gap-2 justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                  The Weight Cut Wizard
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Ask me anything about safe weight cutting, nutrition, or hydration
                </p>
              </div>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto mb-4 pr-2">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <p>Welcome, {userName}! Ask me for guidance on your weight cut journey.</p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl p-4 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground ml-4"
                        : "bg-gradient-to-br from-secondary/20 to-primary/10 border border-border/50 mr-4"
                    }`}
                  >
                    {msg.content === "🔮 The Wizard is thinking..." ? (
                      <div className="flex items-center gap-2">
                        <img src={wizardThinking} alt="Thinking" className="w-6 h-6 animate-pulse" />
                        <p className="text-sm leading-relaxed">The Wizard is thinking...</p>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask the Wizard for guidance..."
                disabled={loading}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}