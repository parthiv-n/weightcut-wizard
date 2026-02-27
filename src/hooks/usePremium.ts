import { useUser } from "@/contexts/UserContext";

export function usePremium() {
  const { profile } = useUser();
  return { isPremium: profile?.is_premium === true };
}
