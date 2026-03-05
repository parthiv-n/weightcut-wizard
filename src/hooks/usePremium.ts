import { useProfile } from "@/contexts/UserContext";

export function usePremium() {
  const { profile } = useProfile();
  return { isPremium: profile?.is_premium === true };
}
