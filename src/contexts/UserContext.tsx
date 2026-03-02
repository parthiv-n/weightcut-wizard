import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withAuthTimeout, withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { localCache } from "@/lib/localCache";

export interface ProfileData {
  id?: string;
  age?: number;
  sex?: string;
  height_cm?: number;
  current_weight_kg?: number;
  goal_weight_kg?: number;
  fight_week_target_kg?: number | null;
  target_date?: string;
  activity_level?: string;
  training_frequency?: number;
  tdee?: number;
  bmr?: number;
  ai_recommended_calories?: number;
  ai_recommended_protein_g?: number;
  ai_recommended_carbs_g?: number;
  ai_recommended_fats_g?: number;
  manual_nutrition_override?: boolean;
  avatar_url?: string;
  is_premium?: boolean;
  [key: string]: any;
}

interface UserContextType {
  userName: string;
  avatarUrl: string;
  userId: string | null;
  currentWeight: number | null;
  profile: ProfileData | null;
  isSessionValid: boolean;
  isLoading: boolean;
  hasProfile: boolean;
  authError: boolean;
  isOffline: boolean;
  setUserName: (name: string) => void;
  setAvatarUrl: (url: string) => void;
  updateCurrentWeight: (weight: number) => Promise<void>;
  loadUserData: () => Promise<void>;
  refreshProfile: () => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
  checkSessionValidity: () => Promise<boolean>;
  retryAuth: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userName, setUserName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isSessionValid, setIsSessionValid] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasProfile, setHasProfile] = useState<boolean>(false);
  const [authError, setAuthError] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const isUserLoadedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const profileRef = useRef<ProfileData | null>(null);

  const checkSessionValidity = async (): Promise<boolean> => {
    try {
      const { data: { session }, error } = await withAuthTimeout(
        supabase.auth.getSession()
      );

      if (error || !session) {
        setIsSessionValid(false);
        return false;
      }

      const now = Date.now();
      const expiresAt = session.expires_at! * 1000;
      const timeUntilExpiry = expiresAt - now;
      const fiveMinutes = 5 * 60 * 1000;

      if (timeUntilExpiry <= 0) {
        setIsSessionValid(false);
        return false;
      }

      if (timeUntilExpiry < fiveMinutes) {
        return await refreshSession();
      }

      setIsSessionValid(true);
      return true;
    } catch (error) {
      setIsSessionValid(false);
      return false;
    }
  };

  const refreshSession = async (): Promise<boolean> => {
    try {
      const { data, error } = await withAuthTimeout(
        supabase.auth.refreshSession()
      );

      if (error || !data.session) {
        setIsSessionValid(false);
        return false;
      }

      setIsSessionValid(true);
      return true;
    } catch (error) {
      setIsSessionValid(false);
      return false;
    }
  };

  const refreshProfile = async (): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) {
      console.warn("refreshProfile: skipped — no userId yet");
      return false;
    }

    const attempt = async (): Promise<boolean> => {
      const { data } = await withSupabaseTimeout(
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        4000,
        "Profile refresh query"
      );

      if (data) {
        setProfile(data);
        profileRef.current = data;
        setHasProfile(true);
        if (data.avatar_url) setAvatarUrl(data.avatar_url);
        const weight = data.current_weight_kg ?? null;
        if (weight !== null) setCurrentWeight(weight);
        localCache.set(uid, 'profiles', data);
        return true;
      }
      return false;
    };

    try {
      return await attempt();
    } catch (error) {
      console.warn("refreshProfile: first attempt failed, retrying...", error);
      // Single retry after short delay
      try {
        await new Promise(r => setTimeout(r, 500));
        return await attempt();
      } catch (retryError) {
        console.error("refreshProfile: retry also failed:", retryError);
        return false;
      }
    }
  };

  // Internal: performs one load attempt. Returns 'success' | 'no_session' | 'error'.
  // Does NOT touch isLoading, authError, or isUserLoadedRef.
  const _performLoad = async (): Promise<'success' | 'no_session' | 'error'> => {
    try {
      const { data: { session }, error } = await withAuthTimeout(
        supabase.auth.getSession()
      );

      if (error) {
        console.error("Auth session error:", error);
        return 'error';
      }

      if (!session?.user) {
        setIsSessionValid(false);
        setUserId(null);
        userIdRef.current = null;
        setHasProfile(false);
        return 'no_session';
      }

      const user = session.user;
      setIsSessionValid(true);
      setUserId(user.id);
      userIdRef.current = user.id;

      // Load name from localStorage first for instant display
      const savedName = localStorage.getItem(`user_name_${user.id}`);
      if (savedName) {
        setUserName(savedName);
      } else {
        const emailName = user.email?.split("@")[0] || "Fighter";
        const formattedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
        setUserName(formattedName);
      }

      // Cold-start seed: serve from cache immediately so the app never blocks on DB
      // Profile cache expires after 1 hour to prevent serving very stale data
      const PROFILE_CACHE_TTL = 60 * 60 * 1000;
      const cachedProfile = localCache.get<ProfileData>(user.id, 'profiles', PROFILE_CACHE_TTL);
      if (cachedProfile) {
        setProfile(cachedProfile);
        profileRef.current = cachedProfile;
        setHasProfile(true);
        if (cachedProfile.avatar_url) setAvatarUrl(cachedProfile.avatar_url);
        if (cachedProfile.current_weight_kg) setCurrentWeight(cachedProfile.current_weight_kg);
        // Resolve loading now so ProtectedRoute renders without waiting for DB
        isUserLoadedRef.current = true;
        setIsLoading(false);
      }

      // Parallelize profile + weight queries
      const [profileResult, weightResult] = await Promise.allSettled([
        withSupabaseTimeout(
          supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle(),
          4000,
          "Profile query"
        ),
        withSupabaseTimeout(
          supabase
            .from("weight_logs")
            .select("weight_kg")
            .eq("user_id", user.id)
            .order("date", { ascending: false })
            .limit(1)
            .maybeSingle(),
          4000,
          "Weight log query"
        ),
      ]);

      // If both parallel queries failed (network error), treat as error to retry
      if (profileResult.status === "rejected" && weightResult.status === "rejected") {
        return 'error';
      }

      const profileData = profileResult.status === "fulfilled" ? profileResult.value.data : null;
      const latestWeightLog = weightResult.status === "fulfilled" ? weightResult.value.data : null;

      setHasProfile(!!profileData);

      if (profileData) {
        setProfile(profileData);
        profileRef.current = profileData;
        if (profileData.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
        localCache.set(user.id, 'profiles', profileData);
      }

      const weight = latestWeightLog?.weight_kg || profileData?.current_weight_kg || null;
      setCurrentWeight(weight);

      return 'success';
    } catch (error) {
      console.error("Error loading user data:", error);
      return 'error';
    }
  };

  const loadUserData = async () => {
    setAuthError(false);
    // Only show loading spinner if cache hasn't already resolved it
    if (!isUserLoadedRef.current) {
      setIsLoading(true);
    }

    // Aggressive exponential backoff for faster recovery from short network drops
    const DELAYS = [100, 500, 1500, 3000];

    for (let attempt = 0; attempt <= DELAYS.length; attempt++) {
      const result = await _performLoad();

      if (result === 'success' || result === 'no_session') {
        isUserLoadedRef.current = true;
        setIsLoading(false);
        return;
      }

      // 'error' — retry unless exhausted
      if (attempt < DELAYS.length) {
        await new Promise(r => setTimeout(r, DELAYS[attempt]));
      }
    }

    // All retries failed
    // If cache already served content, don't show error screen — just stay with cached data
    if (isUserLoadedRef.current) {
      console.warn("loadUserData: DB unreachable, serving cached data");
      return;
    }

    // True first-launch with no cache and all retries exhausted → show error UI
    setAuthError(true);
    setIsSessionValid(false);
    setUserId(null);
    userIdRef.current = null;
    setHasProfile(false);
    isUserLoadedRef.current = true;
    setIsLoading(false);
  };

  const retryAuth = async () => {
    setAuthError(false);
    setIsLoading(true);
    await loadUserData();
  };

  const updateCurrentWeight = async (weight: number) => {
    setCurrentWeight(weight);
    setProfile(prev => {
      const updated = prev ? { ...prev, current_weight_kg: weight } : prev;
      profileRef.current = updated;
      return updated;
    });

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          await loadUserData();
        } else {
          setIsLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
        // Clear all cached data for this user before resetting refs
        const uid = userIdRef.current;
        if (uid) localCache.clearUser(uid);
        isUserLoadedRef.current = false;
        setIsSessionValid(false);
        setUserId(null);
        userIdRef.current = null;
        setUserName("");
        setAvatarUrl("");
        setCurrentWeight(null);
        setProfile(null);
        profileRef.current = null;
        setHasProfile(false);
        setIsLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setIsSessionValid(true);
        // Refresh profile data after token refresh to avoid serving stale context
        if (isUserLoadedRef.current && userIdRef.current) {
          refreshProfile();
        }
      } else if (event === 'SIGNED_IN' && session) {
        setIsSessionValid(true);
        if (!isUserLoadedRef.current) {
          setIsLoading(true); // only for fresh logins, not token refreshes
        }
        await loadUserData();
      }
    });

    // Periodic session validity checks (every 30 minutes)
    const sessionCheckInterval = setInterval(async () => {
      await checkSessionValidity();
    }, 30 * 60 * 1000);

    // Proactive session refresh / full reload on app resume
    let appResumeHandle: { remove: () => void } | null = null;
    let visibilityHandler: (() => void) | null = null;

    const handleAppResume = () => {
      // If profile failed to load initially, do a full reload on resume
      if (!userIdRef.current || !profileRef.current) {
        loadUserData();
      } else {
        // Verify session is still valid, then refresh profile data from DB
        checkSessionValidity().then(valid => {
          if (valid) refreshProfile();
        });
      }
      // Flush any offline writes queued while the app was backgrounded
      if (userIdRef.current) {
        import('@/lib/syncQueue').then(({ syncQueue }) => {
          syncQueue.process(userIdRef.current!).catch(() => { });
        });
      }
    };

    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) handleAppResume();
      }).then(h => { appResumeHandle = h; });
    } else {
      visibilityHandler = () => {
        if (document.visibilityState === 'visible') handleAppResume();
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }

    return () => {
      subscription.unsubscribe();
      clearInterval(sessionCheckInterval);
      appResumeHandle?.remove();
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
    };
  }, []);

  // Network online/offline detection + auto-reconnect
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Auto-reconnect if data not loaded yet
      if (!userIdRef.current || !profileRef.current) {
        loadUserData();
      }
      // Flush queued offline writes on reconnect
      if (userIdRef.current) {
        import('@/lib/syncQueue').then(({ syncQueue }) => {
          syncQueue.process(userIdRef.current!).catch(() => { });
        });
      }
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <UserContext.Provider
      value={{
        userName,
        avatarUrl,
        userId,
        currentWeight,
        profile,
        isSessionValid,
        isLoading,
        hasProfile,
        authError,
        isOffline,
        setUserName: updateUserName,
        setAvatarUrl: updateAvatarUrl,
        updateCurrentWeight,
        loadUserData,
        refreshProfile,
        refreshSession,
        checkSessionValidity,
        retryAuth,
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
