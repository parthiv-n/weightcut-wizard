import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from "react";
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

const PROFILE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CachedState {
  userId: string;
  profile: ProfileData;
  userName: string;
  avatarUrl: string;
  currentWeight: number | null;
}

/** Synchronously reads cached auth state from localStorage so returning users
 *  see their dashboard on the first render frame — no loading spinner. */
function getInitialCachedState(): CachedState | null {
  try {
    const userId = localStorage.getItem('wcw_last_userId');
    if (!userId) return null;

    const profile = localCache.get<ProfileData>(userId, 'profiles', PROFILE_CACHE_TTL);
    if (!profile) return null;

    const savedName = localStorage.getItem(`user_name_${userId}`);
    const userName = savedName || 'Fighter';
    const avatarUrl = profile.avatar_url || '';
    const currentWeight = profile.current_weight_kg ?? null;

    return { userId, profile, userName, avatarUrl, currentWeight };
  } catch {
    return null;
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [cached] = useState(() => getInitialCachedState());
  const [userName, setUserName] = useState<string>(cached?.userName ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string>(cached?.avatarUrl ?? "");
  const [userId, setUserId] = useState<string | null>(cached?.userId ?? null);
  const [currentWeight, setCurrentWeight] = useState<number | null>(cached?.currentWeight ?? null);
  const [profile, setProfile] = useState<ProfileData | null>(cached?.profile ?? null);
  const [isSessionValid, setIsSessionValid] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(!cached);
  const [hasProfile, setHasProfile] = useState<boolean>(!!cached);
  const [authError, setAuthError] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const isUserLoadedRef = useRef(!!cached);
  const userIdRef = useRef<string | null>(cached?.userId ?? null);
  const profileRef = useRef<ProfileData | null>(cached?.profile ?? null);
  const currentWeightRef = useRef<number | null>(cached?.currentWeight ?? null);

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
        const prev = profileRef.current;
        const changed = !prev || JSON.stringify(prev) !== JSON.stringify(data);
        if (changed) {
          setProfile(data);
          profileRef.current = data;
          if (data.avatar_url) setAvatarUrl(data.avatar_url);
          const weight = data.current_weight_kg ?? null;
          if (weight !== null && weight !== currentWeightRef.current) {
            setCurrentWeight(weight);
            currentWeightRef.current = weight;
          }
        }
        setHasProfile(true);
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
        supabase.auth.getSession(),
        5000
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
      userIdRef.current = user.id;
      localStorage.setItem('wcw_last_userId', user.id);

      // Skip redundant setState calls when already hydrated from cache
      if (!isUserLoadedRef.current) {
        setIsSessionValid(true);
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
      } else {
        setIsSessionValid(true);
      }

      // Cold-start seed: serve from cache immediately so the app never blocks on DB
      // Skip if already hydrated from synchronous cache (getInitialCachedState)
      if (!isUserLoadedRef.current) {
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

      const shouldHaveProfile = !!profileData;
      if (shouldHaveProfile !== !!profileRef.current && !shouldHaveProfile) {
        // Only transition hasProfile false→true or true→false when it actually changes
        setHasProfile(false);
      }

      if (profileData) {
        // Only update state if profile actually changed (avoid redundant re-renders)
        const prev = profileRef.current;
        const changed = !prev || JSON.stringify(prev) !== JSON.stringify(profileData);
        if (changed) {
          setProfile(profileData);
          profileRef.current = profileData;
          setHasProfile(true);
          if (profileData.avatar_url) {
            setAvatarUrl(profileData.avatar_url);
          }
        }
        localCache.set(user.id, 'profiles', profileData);
      }

      const weight = latestWeightLog?.weight_kg || profileData?.current_weight_kg || null;
      if (weight !== currentWeightRef.current) {
        setCurrentWeight(weight);
        currentWeightRef.current = weight;
      }

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
    currentWeightRef.current = weight;
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
          if (isUserLoadedRef.current) {
            // Already hydrated from cache — silent background refresh, no spinner
            _performLoad().catch(() => {});
          } else {
            await loadUserData();
          }
        } else if (isUserLoadedRef.current) {
          // No valid session but we hydrated from cache — stale login, reset everything
          localStorage.removeItem('wcw_last_userId');
          isUserLoadedRef.current = false;
          setUserId(null);
          userIdRef.current = null;
          setUserName("");
          setAvatarUrl("");
          setCurrentWeight(null);
          setProfile(null);
          profileRef.current = null;
          setHasProfile(false);
          setIsSessionValid(false);
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
        // Clear all cached data for this user before resetting refs
        const uid = userIdRef.current;
        if (uid) localCache.clearUser(uid);
        localStorage.removeItem('wcw_last_userId');
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

    // Safety net: if INITIAL_SESSION never fires (iOS Keychain hang), prevent
    // the user from being stuck on the loading screen forever.
    const safetyTimer = setTimeout(() => {
      if (!isUserLoadedRef.current) {
        console.warn("Safety timeout (5s): INITIAL_SESSION never fired, calling loadUserData()");
        loadUserData();
      }
    }, 5000);

    const hardReleaseTimer = setTimeout(() => {
      if (!isUserLoadedRef.current) {
        console.warn("Hard release (10s): forcing isLoading=false");
        isUserLoadedRef.current = true;
        setIsLoading(false);
      }
    }, 10000);

    // Periodic session validity checks (every 30 minutes)
    const sessionCheckInterval = setInterval(async () => {
      await checkSessionValidity();
    }, 30 * 60 * 1000);

    // Proactive session refresh / full reload on app resume
    let appResumeHandle: { remove: () => void } | null = null;
    let visibilityHandler: (() => void) | null = null;

    const handleAppResume = () => {
      if (isUserLoadedRef.current) {
        // User was already loaded — silent refresh without touching isLoading
        _performLoad().catch(() => {});
      } else {
        // Nothing loaded yet — full load with loading spinner
        loadUserData();
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
      clearTimeout(safetyTimer);
      clearTimeout(hardReleaseTimer);
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

  const contextValue = useMemo<UserContextType>(() => ({
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
  }), [userName, avatarUrl, userId, currentWeight, profile, isSessionValid, isLoading, hasProfile, authError, isOffline]);

  return (
    <UserContext.Provider value={contextValue}>
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
