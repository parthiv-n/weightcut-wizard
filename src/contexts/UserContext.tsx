import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UserContextType {
  userName: string;
  avatarUrl: string;
  userId: string | null;
  currentWeight: number | null;
  isSessionValid: boolean;
  setUserName: (name: string) => void;
  setAvatarUrl: (url: string) => void;
  updateCurrentWeight: (weight: number) => Promise<void>;
  loadUserData: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  checkSessionValidity: () => Promise<boolean>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userName, setUserName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [isSessionValid, setIsSessionValid] = useState<boolean>(false);

  // Step 3: Add Auth State Monitoring
  const checkSessionValidity = async (): Promise<boolean> => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error("Session check error:", error);
        setIsSessionValid(false);
        return false;
      }
      
      if (!session) {
        console.log("No active session found");
        setIsSessionValid(false);
        return false;
      }
      
      // Check if session is expired or close to expiry
      const now = Date.now();
      const expiresAt = session.expires_at! * 1000;
      const timeUntilExpiry = expiresAt - now;
      const fiveMinutes = 5 * 60 * 1000;
      
      if (timeUntilExpiry <= 0) {
        console.log("Session has expired");
        setIsSessionValid(false);
        return false;
      }
      
      if (timeUntilExpiry < fiveMinutes) {
        console.log("Session expires soon, attempting refresh...");
        return await refreshSession();
      }
      
      setIsSessionValid(true);
      return true;
    } catch (error) {
      console.error("Error checking session validity:", error);
      setIsSessionValid(false);
      return false;
    }
  };

  // Step 2: Implement Session Refresh Logic
  const refreshSession = async (): Promise<boolean> => {
    try {
      console.log("🔄 Attempting to refresh session...");
      
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error("❌ Session refresh failed:", error);
        setIsSessionValid(false);
        return false;
      }
      
      if (data.session) {
        console.log("✅ Session refreshed successfully");
        console.log("- New expiry:", new Date(data.session.expires_at! * 1000).toLocaleString());
        setIsSessionValid(true);
        return true;
      }
      
      console.log("❌ No session returned from refresh");
      setIsSessionValid(false);
      return false;
    } catch (error) {
      console.error("❌ Exception during session refresh:", error);
      setIsSessionValid(false);
      return false;
    }
  };

  const loadUserData = async () => {
    // First check if we have a valid session
    const sessionValid = await checkSessionValidity();
    if (!sessionValid) {
      console.log("Invalid session, cannot load user data");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      
      // Load name from localStorage first for instant display
      const savedName = localStorage.getItem(`user_name_${user.id}`);
      if (savedName) {
        setUserName(savedName);
      } else {
        const emailName = user.email?.split("@")[0] || "Fighter";
        const formattedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
        setUserName(formattedName);
      }

      // Load avatar from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url, current_weight_kg")
        .eq("id", user.id)
        .single();
      
      if (profile?.avatar_url) {
        setAvatarUrl(profile.avatar_url);
      }

      // Load current weight from latest weight log
      const { data: latestWeightLog } = await supabase
        .from("weight_logs")
        .select("weight_kg")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Use latest weight log if available, otherwise use profile weight
      const weight = latestWeightLog?.weight_kg || profile?.current_weight_kg || null;
      setCurrentWeight(weight);
    }
  };

  const updateCurrentWeight = async (weight: number) => {
    setCurrentWeight(weight);
    
    // Update profile in database
    if (userId) {
      await supabase
        .from("profiles")
        .update({ current_weight_kg: weight })
        .eq("id", userId);
    }
  };

  const updateUserName = (name: string) => {
    setUserName(name);
    if (userId) {
      localStorage.setItem(`user_name_${userId}`, name);
    }
  };

  const updateAvatarUrl = (url: string) => {
    setAvatarUrl(url);
  };

  useEffect(() => {
    loadUserData();
    
    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔐 Auth state changed:", event);
      
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT') {
          setIsSessionValid(false);
          setUserId(null);
          setUserName("");
          setAvatarUrl("");
          setCurrentWeight(null);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          console.log("✅ Token refreshed automatically");
          setIsSessionValid(true);
        }
      }
      
      if (event === 'SIGNED_IN' && session) {
        console.log("✅ User signed in");
        setIsSessionValid(true);
        await loadUserData();
      }
    });

    // Set up periodic session validity checks (every 5 minutes)
    const sessionCheckInterval = setInterval(async () => {
      await checkSessionValidity();
    }, 5 * 60 * 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(sessionCheckInterval);
    };
  }, []);

  return (
    <UserContext.Provider
      value={{
        userName,
        avatarUrl,
        userId,
        currentWeight,
        isSessionValid,
        setUserName: updateUserName,
        setAvatarUrl: updateAvatarUrl,
        updateCurrentWeight,
        loadUserData,
        refreshSession,
        checkSessionValidity,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
