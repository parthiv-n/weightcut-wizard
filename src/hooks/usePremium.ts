import { useSubscriptionContext } from "@/contexts/SubscriptionContext";

export function usePremium() {
  const { isPremium } = useSubscriptionContext();
  return { isPremium };
}
