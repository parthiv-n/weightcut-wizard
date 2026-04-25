import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withAuthTimeout, withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { localCache } from "@/lib/localCache";
import { nutritionCache, startCacheCleanup, stopCacheCleanup } from "@/lib/nutritionCache";
import { AIPersistence } from "@/lib/aiPersistence";
import { logger } from "@/lib/logger";
import { PROFILE_COLUMNS } from "@/lib/queryColumns";
import { useMealsRealtime } from "@/hooks/useMealsRealtime";

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
  normal_daily_carbs_g?: number;
  manual_nutrition_override?: boolean;
  avatar_url?: string;
  goal_type?: 'cutting' | 'losing';
  is_premium?: boolean;
  subscription_tier?: string;
  subscription_expires_at?: string | null;
  gems?: number;
  last_free_gem_date?: string;
  ads_watched_today?: number;
  ads_watched_date?: string;
  cut_plan_json?: any;
  [key: string]: any;
}

const AI_RELEVANT_FIELDS: (keyof ProfileData)[] = [
  'goal_weight_kg', 'fight_week_target_kg', 'target_date',
  'activity_level', 'tdee', 'bmr',
  'age', 'sex', 'height_cm', 'training_frequency', 'goal_type',
];

function haveAIFieldsChanged(prev: ProfileData | null, next: ProfileData): boolean {
  if (!prev) return false; // first load — nothing to invalidate
  return AI_RELEVANT_FIELDS.some(f => prev[f] !== next[f]);
}

interface AuthContextType {
  userId: string | null;
  isSessionValid: boolean;
  isLoading: boolean;
  hasProfile: boolean;
  authError: boolean;
  isOffline: boolean;
  retryAuth: () => Promise<void>;
  checkSessionValidity: () => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
  loadUserData: () => Promise<void>;
  signOut: () => Promise<void>;
}

interface ProfileContextType {
  profile: ProfileData | null;
  userName: string;
  avatarUrl: string;
  currentWeight: number | null;
  setUserName: (name: string) => void;
  setAvatarUrl: (url: string) => void;
  refreshProfile: () => Promise<boolean>;
  updateCurrentWeight: (weight: number) => Promise<void>;
  syncDailyGem: () => Promise<void>;
}

type UserContextType = AuthContextType & ProfileContextType;

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userName, setUserName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  useMealsRealtime(userId);
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
  const signingOutRef = useRef(false);

  const checkSessionValidity = useCallback(async (): Promise<boolean> => {
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
        // Token expired — still try refresh (refresh token has longer TTL)
        return await refreshSession();
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
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
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
  }, []);

  const refreshProfileRef = useRef<(() => Promise<boolean>) | null>(null);

  // Grant the daily free gem (idempotent RPC — caps at 2) and then pull
  // the fresh profile so `profile.gems` reflects the grant. Called on
  // login, app foreground, visibility change, and midnight rollover.
  const syncDailyGem = useCallback(async (): Promise<void> => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      await (supabase.rpc as any)('grant_daily_free_gem', { p_user_id: uid });
    } catch (e) {
      logger.warn('syncDailyGem: grant_daily_free_gem failed', { error: String(e) });
    }
    try {
      await refreshProfileRef.current?.();
    } catch (e) {
      logger.warn('syncDailyGem: refreshProfile failed', { error: String(e) });
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) {
      logger.warn("refreshProfile: skipped — no userId yet");
      return false;
    }

    const attempt = async (): Promise<boolean> => {
      const { data } = await withSupabaseTimeout(
        supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", uid).maybeSingle(),
        5000,
        "Profile refresh query"
      );

      if (data) {
        // Stale-call guard: if userId changed during the async query, discard result
        if (userIdRef.current !== uid) {
          logger.warn("refreshProfile: userId changed during fetch, discarding stale result");
          return false;
        }
        const changed = JSON.stringify(data) !== JSON.stringify(profileRef.current);
        if (changed) {
          // Invalidate AI caches if AI-relevant profile fields changed
          if (haveAIFieldsChanged(profileRef.current, data as ProfileData)) {
            AIPersistence.clearAllForUser(uid);
          }
          setProfile(data as ProfileData);
          profileRef.current = data as ProfileData;
          setHasProfile(true);
          if (data.avatar_url) setAvatarUrl(data.avatar_url);
          const weight = data.current_weight_kg ?? null;
          if (weight !== null) setCurrentWeight(weight);
          localCache.set(uid, 'profiles', data);
        }
        return true;
      }
      return false;
    };

    try {
      return await attempt();
    } catch (error) {
      logger.warn("refreshProfile: first attempt failed, retrying...", { error: String(error) });
      // A timeout here means the Supabase client's internal auth mutex is
      // wedged (stale realtime socket). Cycle realtime + force-refresh the
      // token before the retry so we don't just queue behind the same stuck
      // mutex for another 5s.
      const msg = (error as { message?: string })?.message ?? "";
      if (msg.includes("timed out")) {
        try {
          const { recoverSupabaseConnection } = await import("@/lib/connectionRecovery");
          await recoverSupabaseConnection("refresh-profile-timeout");
        } catch { /* recovery itself is best-effort */ }
      }
      try {
        await new Promise(r => setTimeout(r, 500));
        return await attempt();
      } catch (retryError) {
        logger.error("refreshProfile: retry also failed", retryError);
        return false;
      }
    }
  }, []);

  // Keep a ref to refreshProfile so syncDailyGem (declared earlier) can invoke it.
  refreshProfileRef.current = refreshProfile;

  // Internal: performs one load attempt. Returns 'success' | 'no_session' | 'error'.
  // Does NOT touch isLoading, authError, or isUserLoadedRef.
  // When `providedSession` is given (from auth events), skips the redundant getSession() call.
  const _performLoad = async (providedSession?: { user: any; expires_at?: number } | null): Promise<'success' | 'no_session' | 'error'> => {
    try {
      let session = providedSession;
      if (!session) {
        // Phase 1.1: retry once after 2s on auth timeout before surfacing authError.
        // Cold iOS Capacitor launches can legitimately take >6s (secure-storage read +
        // token refresh round-trip); a single retry covers the long tail without
        // bouncing users to the error screen.
        let data: Awaited<ReturnType<typeof supabase.auth.getSession>>['data'] | null = null;
        let error: Awaited<ReturnType<typeof supabase.auth.getSession>>['error'] | null = null;
        try {
          logger.warn("UserContext._performLoad: auth attempt 1/2");
          const res = await withAuthTimeout(supabase.auth.getSession());
          data = res.data;
          error = res.error;
        } catch (timeoutErr) {
          logger.warn("UserContext._performLoad: auth attempt 1 timed out, cycling realtime + retrying in 2s", { error: String(timeoutErr) });
          // Recovery before the retry — otherwise attempt 2 queues behind
          // the same wedged mutex and also hits its 15s timeout.
          try {
            const { recoverSupabaseConnection } = await import("@/lib/connectionRecovery");
            await recoverSupabaseConnection("auth-session-timeout");
          } catch { /* best-effort */ }
          await new Promise((r) => setTimeout(r, 2000));
          try {
            logger.warn("UserContext._performLoad: auth attempt 2/2");
            const res = await withAuthTimeout(supabase.auth.getSession());
            data = res.data;
            error = res.error;
          } catch (retryErr) {
            logger.error("UserContext._performLoad: auth attempt 2 also timed out", retryErr);
            return 'error';
          }
        }
        if (error) {
          logger.error("Auth session error", error);
          return 'error';
        }
        session = data?.session ?? null;
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

      // Cold-start seed: serve ANY cached profile immediately so the app never blocks on DB
      // Fresh data replaces stale data via the DB query below
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
      }

      // Parallelize profile + weight queries
      const [profileResult, weightResult] = await Promise.allSettled([
        withSupabaseTimeout(
          supabase
            .from("profiles")
            .select(PROFILE_COLUMNS)
            .eq("id", user.id)
            .maybeSingle(),
          8000,
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
          8000,
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
        const changed = JSON.stringify(profileData) !== JSON.stringify(profileRef.current);
        if (changed) {
          setProfile(profileData as ProfileData);
          profileRef.current = profileData as ProfileData;
          if (profileData.avatar_url) {
            setAvatarUrl(profileData.avatar_url);
          }
          localCache.set(user.id, 'profiles', profileData);
        }
      }

      const weight = latestWeightLog?.weight_kg || profileData?.current_weight_kg || null;
      setCurrentWeight(weight);

      return 'success';
    } catch (error) {
      logger.error("Error loading user data", error);
      return 'error';
    }
  };

  const loadInProgressRef = useRef(false);
  const lastLoadAttemptRef = useRef(0);

  const loadUserData = useCallback(async (providedSession?: { user: any; expires_at?: number } | null) => {
    // Throttle: skip if already loading or called within last 3 seconds
    const now = Date.now();
    if (loadInProgressRef.current) return;
    if (!providedSession && now - lastLoadAttemptRef.current < 3000) return;
    loadInProgressRef.current = true;
    lastLoadAttemptRef.current = now;

    setAuthError(false);
    if (!isUserLoadedRef.current) {
      setIsLoading(true);
    }

    const DELAYS = [100, 200, 500];

    try {
      for (let attempt = 0; attempt <= DELAYS.length; attempt++) {
        const result = await _performLoad(attempt === 0 ? providedSession : undefined);

        if (result === 'success' || result === 'no_session') {
          isUserLoadedRef.current = true;
          setIsLoading(false);
          if (result === 'success') {
            // Fire-and-forget: grant daily free gem + refresh profile so gems
            // count is correct on cold start / login / resume.
            syncDailyGem().catch(() => {});
          }
          return;
        }

        if (attempt < DELAYS.length) {
          await new Promise(r => setTimeout(r, DELAYS[attempt]));
        }
      }

      // All retries failed
      if (isUserLoadedRef.current) {
        logger.warn("loadUserData: DB unreachable, serving cached data");
        return;
      }

      setAuthError(true);
      setIsSessionValid(false);
      setUserId(null);
      userIdRef.current = null;
      setHasProfile(false);
      isUserLoadedRef.current = true;
      setIsLoading(false);
    } finally {
      loadInProgressRef.current = false;
    }
  }, []);

  const retryAuth = useCallback(async () => {
    setAuthError(false);
    setIsLoading(true);
    await loadUserData();
  }, [loadUserData]);

  const updateCurrentWeight = useCallback(async (weight: number) => {
    const previousWeight = profileRef.current?.current_weight_kg;

    setCurrentWeight(weight);
    setProfile(prev => {
      const updated = prev ? { ...prev, current_weight_kg: weight } : prev;
      profileRef.current = updated;
      return updated;
    });


    if (userIdRef.current) {
      await supabase
        .from("profiles")
        .update({ current_weight_kg: weight })
        .eq("id", userIdRef.current);
    }
  }, []);

  const updateUserName = useCallback((name: string) => {
    setUserName(name);
    if (userIdRef.current) {
      localStorage.setItem(`user_name_${userIdRef.current}`, name);
    }
  }, []);

  const updateAvatarUrl = useCallback((url: string) => {
    setAvatarUrl(url);
  }, []);

  // Centralized sign-out: immediately clears all state, then tells Supabase
  const signOut = useCallback(async () => {
    signingOutRef.current = true;

    // Immediately clear all state so UI updates instantly
    stopCacheCleanup();
    const uid = userIdRef.current;
    if (uid) {
      localCache.clearUser(uid);
      nutritionCache.clearUser(uid);
    }
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

    // Clear Supabase session — local scope avoids 403 from expired/invalid tokens
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      localStorage.removeItem("weightcut-wizard-auth");
    }

    signingOutRef.current = false;
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // If signOut() already cleared state, ignore all events except SIGNED_OUT (which is a no-op)
      if (signingOutRef.current && event !== 'SIGNED_OUT') return;

      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          startCacheCleanup();
          await loadUserData(session);
          // Drop any stale `nutrition_logs` queue entries left over from the
          // pre-v2 schema on cold start too.
          try {
            const uid = session.user?.id;
            if (uid) {
              const {
                dropLegacyNutritionLogsQueueEntries,
                wipeLegacyNutritionLocalCache,
                purgeGhostMealQueueEntries,
              } = await import('@/lib/pendingMeals');
              const { syncQueue } = await import('@/lib/syncQueue');
              const dropped = dropLegacyNutritionLogsQueueEntries(uid);
              wipeLegacyNutritionLocalCache(uid);
              purgeGhostMealQueueEntries(uid);
              syncQueue.pruneStaleFailed(uid);
              if (dropped > 0) {
                logger.warn(`dropped ${dropped} legacy queue entries`);
              }
            }
          } catch (err) {
            logger.warn('nutrition queue boot-drain failed (initial)', { err });
          }
        } else {
          setIsLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
        // signOut() already cleared state — this is just a safety net
        if (!signingOutRef.current) {
          stopCacheCleanup();
          const uid = userIdRef.current;
          if (uid) {
            localCache.clearUser(uid);
            nutritionCache.clearUser(uid);
          }
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
        }
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setIsSessionValid(true);
        if (isUserLoadedRef.current && userIdRef.current) {
          syncDailyGem();
        }
      } else if (event === 'PASSWORD_RECOVERY' && session) {
        setIsSessionValid(true);
        await loadUserData(session);
      } else if (event === 'SIGNED_IN' && session) {
        // Distinguish a real login (different userId) from a token refresh (same userId).
        // Fresh logins MUST show the splash through the full profile fetch so the
        // ProfileCompletionGuard never briefly sees hasProfile=false and bounces the
        // user to /onboarding. Token refresh with same user keeps the UI stable.
        const incomingUserId = session.user.id;
        const isFreshLogin = userIdRef.current !== incomingUserId;
        startCacheCleanup();
        setIsSessionValid(true);
        if (isFreshLogin || !isUserLoadedRef.current) {
          if (isFreshLogin) isUserLoadedRef.current = false;
          setIsLoading(true);
        }
        await loadUserData(session);
        // Nutrition overhaul v2: the old `nutrition_logs` table is archived.
        // Any queued inserts against it would fail forever — drop them.
        // `syncQueue.process` below will then replay any queued `meals` RPC
        // payloads via create_meal_with_items.
        try {
          const uid = session.user?.id;
          if (uid) {
            const {
              dropLegacyNutritionLogsQueueEntries,
              purgeGhostMealQueueEntries,
            } = await import('@/lib/pendingMeals');
            const dropped = dropLegacyNutritionLogsQueueEntries(uid);
            purgeGhostMealQueueEntries(uid);
            if (dropped > 0) {
              logger.warn(`dropped ${dropped} legacy queue entries`);
            }
            const { syncQueue } = await import('@/lib/syncQueue');
            syncQueue.pruneStaleFailed(uid);
            syncQueue.process(uid).catch(() => { });
          }
        } catch (err) {
          logger.warn('nutrition queue boot-drain failed', { err });
        }
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
      // Don't attempt reload if user is signing out
      if (signingOutRef.current) return;
      // If profile failed to load initially, do a full reload on resume
      if (!userIdRef.current || !profileRef.current) {
        loadUserData();
      } else {
        // Verify session is still valid, then grant-if-eligible + refresh profile.
        checkSessionValidity().then(valid => {
          if (valid) syncDailyGem();
        });
      }
      // Force-cycle the realtime websocket. When the tab has been idle for a
      // while the websocket silently dies; the REST client then queues every
      // query behind an internal auth-refresh mutex waiting on the dead
      // socket, which manifests as "Weight logs query timed out" and a
      // frozen nutrition ring. Disconnecting + reconnecting unsticks the
      // mutex so subsequent requests land instantly.
      try {
        supabase.realtime.disconnect();
        supabase.realtime.connect();
      } catch (err) {
        logger.warn('realtime reconnect on resume failed', { err: String(err) });
      }
      // Flush any offline writes queued while the app was backgrounded
      if (userIdRef.current) {
        import('@/lib/syncQueue').then(({ syncQueue }) => {
          syncQueue.process(userIdRef.current!).catch(() => { });
        });
        // Proactive localStorage cleanup — prune stale date-bucketed entries (>90 days)
        import('@/lib/localCache').then(({ localCache }) => {
          localCache.pruneStale(userIdRef.current!);
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
      // Proactively unstick the Supabase client — going offline then back
      // online almost always leaves the realtime socket dead, which wedges
      // REST queries behind a stale auth mutex.
      import('@/lib/connectionRecovery').then(({ recoverSupabaseConnection }) => {
        recoverSupabaseConnection('network-online').catch(() => {});
      });
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Proactive realtime health watcher. When the websocket is idle for too
  // long without a heartbeat, the REST client starts queuing every request
  // behind a stuck auth mutex, which manifests as "Profile refresh query
  // timed out" and "Load meals timed out". Polling every 30s and calling
  // recovery when we see a disconnected socket catches the wedge before
  // any user-visible timeout hits.
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      try {
        const isConnected = supabase.realtime.isConnected?.();
        if (isConnected === false) {
          import('@/lib/connectionRecovery').then(({ recoverSupabaseConnection }) => {
            recoverSupabaseConnection('realtime-heartbeat').catch(() => {});
          });
        }
      } catch {
        /* older supabase-js versions may not expose isConnected — ignore */
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [userId]);

  const authValue = useMemo(() => ({
    userId,
    isSessionValid,
    isLoading,
    hasProfile,
    authError,
    isOffline,
    retryAuth,
    checkSessionValidity,
    refreshSession,
    loadUserData,
    signOut,
  }), [userId, isSessionValid, isLoading, hasProfile, authError, isOffline,
       retryAuth, checkSessionValidity, refreshSession, loadUserData, signOut]);

  const profileValue = useMemo(() => ({
    profile,
    userName,
    avatarUrl,
    currentWeight,
    setUserName: updateUserName,
    setAvatarUrl: updateAvatarUrl,
    refreshProfile,
    updateCurrentWeight,
    syncDailyGem,
  }), [profile, userName, avatarUrl, currentWeight,
       updateUserName, updateAvatarUrl, refreshProfile, updateCurrentWeight, syncDailyGem]);

  return (
    <AuthContext.Provider value={authValue}>
      <ProfileContext.Provider value={profileValue}>
        {children}
      </ProfileContext.Provider>
    </AuthContext.Provider>
  );
}

const AUTH_FALLBACK: AuthContextType = {
  userId: null,
  hasProfile: false,
  isLoading: true,
  authError: false,
  isSessionValid: false,
  isOffline: false,
  retryAuth: async () => {},
  checkSessionValidity: async () => false,
  refreshSession: async () => false,
  loadUserData: async () => {},
  signOut: async () => {},
};

const PROFILE_FALLBACK: ProfileContextType = {
  profile: null,
  userName: "",
  avatarUrl: null as any,
  currentWeight: null,
  setUserName: () => {},
  setAvatarUrl: () => {},
  refreshProfile: async () => false,
  updateCurrentWeight: async () => {},
  syncDailyGem: async () => {},
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) return AUTH_FALLBACK;
  return context;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) return PROFILE_FALLBACK;
  return context;
}

export function useUser(): UserContextType {
  const auth = useAuth();
  const profile = useProfile();
  return { ...auth, ...profile };
}
