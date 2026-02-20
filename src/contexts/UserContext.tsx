import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withAuthTimeout, withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { localCache } from "@/lib/localCache";
import { fetchWithRetry } from "@/utils/retry";
import type { Session } from "@supabase/supabase-js";

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
  refreshProfile: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  checkSessionValidity: () => Promise<boolean>;
  retryAuth: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// Boot-flow timeout: if auth hasn't resolved after 5s, unblock the UI
const AUTH_TIMEOUT_MS = 5000;

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
  const [isOffline, setIsOffline] = useState<boolean>(false);
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

  const refreshProfile = async (): Promise<void> => {
    const uid = userIdRef.current;
    if (!uid) return;

    try {
      const { data } = await withSupabaseTimeout(
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        8000,
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
      }
    } catch (error) {
      console.error("Error refreshing profile:", error);
    }
  };

  // Internal: performs one load attempt using the session already received
  // from onAuthStateChange. Does NOT call getSession() — no blocking await.
  // Returns 'success' | 'no_session' | 'error'.
  const _performLoad = async (session: Session | null): Promise<'success' | 'no_session' | 'error'> => {
    try {
      if (!session?.user) {
        console.debug('[auth] _performLoad: no session');
        setIsSessionValid(false);
        setUserId(null);
        userIdRef.current = null;
        setHasProfile(false);
        return 'no_session';
      }

      const user = session.user;
      console.debug('[auth] _performLoad: user', user.id.slice(0, 8));
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
      const cachedProfile = localCache.get<ProfileData>(user.id, 'profiles');
      if (cachedProfile) {
        setProfile(cachedProfile);
        profileRef.current = cachedProfile;
        setHasProfile(true);
        if (cachedProfile.avatar_url) setAvatarUrl(cachedProfile.avatar_url);
        if (cachedProfile.current_weight_kg) setCurrentWeight(cachedProfile.current_weight_kg);
        // Resolve loading now so ProtectedRoute renders without waiting for DB
        isUserLoadedRef.current = true;
        setIsLoading(false);
        console.debug('[auth] Served cached profile, unblocked UI');
      }

      // Parallelize profile + weight queries with retry for first fetch
      console.debug('[auth] Fetching profile + weight from DB');
      const [profileResult, weightResult] = await Promise.allSettled([
        fetchWithRetry(
          () =>
            withSupabaseTimeout(
              supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .maybeSingle(),
              8000,
              "Profile query"
            ),
          2, // 2 retries (3 total attempts)
          1000
        ),
        fetchWithRetry(
          () =>
            withSupabaseTimeout(
              supabase
                .from("weight_logs")
                .select("weight_kg")
                .eq("user_id", user.id)
                .order("date", { ascending: false })
                .limit(1)
                .maybeSingle(),
              8000,
              "Weight log query"
            ),
          2,
          1000
        ),
      ]);

      // If both parallel queries failed (network error), treat as error to retry
      if (profileResult.status === "rejected" && weightResult.status === "rejected") {
        console.debug('[auth] Both DB queries failed');
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
        console.debug('[auth] Profile loaded from DB');
      }

      const weight = latestWeightLog?.weight_kg || profileData?.current_weight_kg || null;
      setCurrentWeight(weight);

      return 'success';
    } catch (error) {
      console.error("Error loading user data:", error);
      return 'error';
    }
  };

  // sessionRef keeps the latest session for loadUserData to use without
  // needing it as a parameter (e.g. from retryAuth, handleAppResume)
  const sessionRef = useRef<Session | null>(null);

  const loadUserData = async (session?: Session | null) => {
    // Use passed session, or fall back to the ref (for retries/resume)
    const activeSession = session !== undefined ? session : sessionRef.current;

    setAuthError(false);
    // Only show loading spinner if cache hasn't already resolved it
    if (!isUserLoadedRef.current) {
      setIsLoading(true);
    }
    const DELAYS = [1000, 2000, 4000];

    for (let attempt = 0; attempt <= DELAYS.length; attempt++) {
      const result = await _performLoad(activeSession);

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
    // On retry, re-fetch session from Supabase since the stored one might be stale
    try {
      const { data: { session } } = await withAuthTimeout(supabase.auth.getSession());
      sessionRef.current = session;
    } catch {
      // Will use whatever sessionRef has
    }
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

  // ── Network readiness check ──────────────────────────────────────────
  useEffect(() => {
    let networkHandle: { remove: () => void } | null = null;

    const initNetwork = async () => {
      try {
        const status = await Network.getStatus();
        console.debug('[network] Initial status:', status.connected ? 'online' : 'offline');
        setIsOffline(!status.connected);
      } catch {
        // Fallback to navigator.onLine on web
        setIsOffline(!navigator.onLine);
      }

      try {
        networkHandle = await Network.addListener('networkStatusChange', (status) => {
          console.debug('[network] Status changed:', status.connected ? 'online' : 'offline');
          setIsOffline(!status.connected);

          if (status.connected) {
            // Auto-reconnect if data not loaded yet
            if (!userIdRef.current || !profileRef.current) {
              loadUserData();
            }
            // Flush queued offline writes on reconnect
            if (userIdRef.current) {
              import('@/lib/syncQueue').then(({ syncQueue }) => {
                syncQueue.process(userIdRef.current!).catch(() => {});
              });
            }
          }
        });
      } catch {
        // Fallback: browser events
        const handleOnline = () => {
          setIsOffline(false);
          if (!userIdRef.current || !profileRef.current) {
            loadUserData();
          }
          if (userIdRef.current) {
            import('@/lib/syncQueue').then(({ syncQueue }) => {
              syncQueue.process(userIdRef.current!).catch(() => {});
            });
          }
        };
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        // Store cleanup refs
        (window as any).__wcw_online = handleOnline;
        (window as any).__wcw_offline = handleOffline;
      }
    };

    initNetwork();

    return () => {
      networkHandle?.remove();
      // Clean up fallback listeners if they were used
      if ((window as any).__wcw_online) {
        window.removeEventListener('online', (window as any).__wcw_online);
        window.removeEventListener('offline', (window as any).__wcw_offline);
        delete (window as any).__wcw_online;
        delete (window as any).__wcw_offline;
      }
    };
  }, []);

  // ── Auth state listener + 5s timeout fallback ────────────────────────
  useEffect(() => {
    // 5-second fallback: if auth hasn't resolved by then, unblock the UI.
    // This prevents the app from hanging on a loading screen indefinitely.
    const fallbackTimer = setTimeout(() => {
      if (!isUserLoadedRef.current) {
        console.warn('[auth] 5s timeout — unblocking UI without auth resolution');
        isUserLoadedRef.current = true;
        setIsLoading(false);
      }
    }, AUTH_TIMEOUT_MS);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.debug('[auth] Event:', event, session ? `user=${session.user.id.slice(0, 8)}` : 'no-session');

      // Keep sessionRef in sync for retryAuth / app resume
      sessionRef.current = session;

      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          await loadUserData(session);
        } else {
          console.debug('[auth] INITIAL_SESSION: no user, unblocking');
          isUserLoadedRef.current = true;
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
      } else if (event === 'SIGNED_IN' && session) {
        setIsSessionValid(true);
        if (!isUserLoadedRef.current) {
          setIsLoading(true); // only for fresh logins, not token refreshes
        }
        await loadUserData(session);
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
      console.debug('[lifecycle] App resumed');
      // If profile failed to load initially, do a full reload on resume
      if (!userIdRef.current || !profileRef.current) {
        loadUserData();
      } else {
        // Refresh session to prevent stale token on resume
        supabase.auth.refreshSession().catch(() => {});
      }
      // Flush any offline writes queued while the app was backgrounded
      if (userIdRef.current) {
        import('@/lib/syncQueue').then(({ syncQueue }) => {
          syncQueue.process(userIdRef.current!).catch(() => {});
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
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
      clearInterval(sessionCheckInterval);
      appResumeHandle?.remove();
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
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
