import { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { useAuth } from "./UserContext";
import { useSubscriptionContext, isLimitHitToday } from "./SubscriptionContext";
import { syncWeightReminder } from "@/lib/weightReminder";
import { logger } from "@/lib/logger";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface WizardBackgroundContextType {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  loadHistory: () => void;
}

const WizardBackgroundContext = createContext<WizardBackgroundContextType | undefined>(undefined);

export function WizardBackgroundProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const { isPremium, openPaywall, incrementLocalUsage, markLimitReached } = useSubscriptionContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize notifications (native only — web requires a user gesture)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      LocalNotifications.requestPermissions().then(() => {
        syncWeightReminder();
      }).catch(() => {});
    }
  }, []);

  const loadHistory = useCallback(() => {
    if (!userId) return;
    const history = localStorage.getItem(`wizard_chat_history_${userId}`);
    if (history) {
      setMessages(JSON.parse(history));
    } else {
      setMessages([
        { role: "assistant", content: "Hey champ! I'm the Weight Cut Wizard. How can I help you dial in your nutrition and weight today?" }
      ]);
    }
  }, [userId]);

  useEffect(() => {
    loadHistory();
  }, [userId]);

  const clearChat = useCallback(() => {
    if (!userId) return;
    localStorage.removeItem(`wizard_chat_history_${userId}`);
    setMessages([
      { role: "assistant", content: "Hey champ! I'm the Weight Cut Wizard. How can I help you dial in your nutrition and weight today?" }
    ]);
  }, [userId]);

  const triggerNotification = async () => {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: "Weight Cut Wizard",
            body: "Your nutrition protocol is ready.",
            id: new Date().getTime(),
            schedule: { at: new Date(Date.now() + 1000) },
            sound: "default",
            actionTypeId: "",
            extra: null
          }
        ]
      });
    } catch (e) {
      logger.warn("Could not schedule local notification", { error: e });
    }
  };

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading || !userId) return;

    const newMessages: Message[] = [...messages, { role: "user", content: content.trim() }];
    setMessages(newMessages);
    setIsLoading(true);
    
    // Save immediate user message to storage so it persists even if they close app mid-fetch
    localStorage.setItem(`wizard_chat_history_${userId}`, JSON.stringify(newMessages));

    // Pre-flight subscription check (localStorage-backed, synchronous)
    if (!isPremium && isLimitHitToday()) {
      openPaywall();
      setIsLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wizard-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ messages: newMessages }),
        }
      );

      if (response.status === 429) {
        markLimitReached();
        openPaywall();
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to get response from Wizard");
      }

      incrementLocalUsage();
      const data = await response.json();
      const assistantMessage = data.choices[0].message.content;

      const finalMessages: Message[] = [...newMessages, { role: "assistant", content: assistantMessage }];
      
      // Update state and storage
      setMessages(finalMessages);
      localStorage.setItem(`wizard_chat_history_${userId}`, JSON.stringify(finalMessages));
      
      // Ping the user
      triggerNotification();

    } catch (error) {
      logger.error("Chat error", error);
      const fallbackMessages: Message[] = [...newMessages, { role: "assistant", content: "Sorry, my crystal ball is cloudy right now. Try again in a moment." }];
      setMessages(fallbackMessages);
      localStorage.setItem(`wizard_chat_history_${userId}`, JSON.stringify(fallbackMessages));
    } finally {
      setIsLoading(false);
    }
  }, [userId, messages, isLoading]);

  const value = useMemo(
    () => ({ messages, isLoading, sendMessage, clearChat, loadHistory }),
    [messages, isLoading, sendMessage, clearChat, loadHistory]
  );

  return (
    <WizardBackgroundContext.Provider value={value}>
      {children}
    </WizardBackgroundContext.Provider>
  );
}

export function useWizardBackground() {
  const context = useContext(WizardBackgroundContext);
  if (context === undefined) {
    throw new Error("useWizardBackground must be used within a WizardBackgroundProvider");
  }
  return context;
}
