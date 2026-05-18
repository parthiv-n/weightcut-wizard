import { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from "react";
import { useAction } from "convex/react";
import { useAIAction } from "@/hooks/useAIAction";
import { api } from "@/../convex/_generated/api";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { useAuth, useUser } from "./UserContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
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
  const { userName } = useUser();
  const { openPaywall, handlePaywallError } = useSubscription();
  const { hasAccess } = useFeatureAccess("AI_WIZARD_CHAT");
  const wizardChatAction = useAIAction(api.actions.wizardChat.run, "AI_WIZARD_CHAT");
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

  const getGreeting = useCallback(() => {
    const name = userName || "champ";
    return `Hey ${name}! I'm the FightCamp Wizard. How can I help you dial in your nutrition and weight today?`;
  }, [userName]);

  const loadHistory = useCallback(() => {
    if (!userId) return;
    const history = localStorage.getItem(`wizard_chat_history_${userId}`);
    if (history) {
      try { setMessages(JSON.parse(history)); } catch { setMessages([{ role: "assistant", content: getGreeting() }]); }
    } else {
      setMessages([
        { role: "assistant", content: getGreeting() }
      ]);
    }
  }, [userId, getGreeting]);

  useEffect(() => {
    loadHistory();
  }, [userId]);

  const clearChat = useCallback(() => {
    if (!userId) return;
    localStorage.removeItem(`wizard_chat_history_${userId}`);
    setMessages([
      { role: "assistant", content: getGreeting() }
    ]);
  }, [userId, getGreeting]);

  const triggerNotification = async () => {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: "FightCamp Wizard",
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

    // Use ref to get current messages without adding to deps
    const currentMessages = JSON.parse(localStorage.getItem(`wizard_chat_history_${userId}`) || "[]") as Message[];
    const newMessages: Message[] = [...currentMessages, { role: "user", content: content.trim() }];
    setMessages(newMessages);
    setIsLoading(true);
    
    // Save immediate user message to storage so it persists even if they close app mid-fetch
    localStorage.setItem(`wizard_chat_history_${userId}`, JSON.stringify(newMessages));

    // Pre-flight Pro check — short-circuit before the network call.
    if (!hasAccess) {
      const limitMessages: Message[] = [...newMessages, {
        role: "assistant",
        content: "AI Coach is a **Pro** feature. Upgrade to Pro to chat with the wizard and unlock unlimited AI access across the app."
      }];
      setMessages(limitMessages);
      localStorage.setItem(`wizard_chat_history_${userId}`, JSON.stringify(limitMessages));
      openPaywall();
      setIsLoading(false);
      return;
    }

    try {
      // Filter out any "system" messages — the Convex wizardChat action only
      // accepts {user|assistant}, and the server already injects the system prompt.
      const apiMessages = newMessages
        .filter((m): m is Message & { role: "user" | "assistant" } =>
          m.role === "user" || m.role === "assistant",
        )
        .map((m) => ({ role: m.role, content: m.content }));

      let data: any;
      try {
        data = await wizardChatAction({
          messages: apiMessages,
          userName: userName || undefined,
        });
      } catch (err: any) {
        // PRO_FEATURE_REQUIRED bubbles up from the server when a free user
        // bypasses the client check; route through the shared paywall handler.
        if (await handlePaywallError(err)) {
          const limitMessages: Message[] = [...newMessages, {
            role: "assistant",
            content: "AI Coach is a **Pro** feature. Upgrade to Pro to keep chatting and unlock unlimited AI access across the app."
          }];
          setMessages(limitMessages);
          localStorage.setItem(`wizard_chat_history_${userId}`, JSON.stringify(limitMessages));
          setIsLoading(false);
          return;
        }
        throw new Error(err?.message || "Failed to get response from Wizard");
      }

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
  }, [userId, isLoading, hasAccess, openPaywall, handlePaywallError, userName, wizardChatAction]);

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
