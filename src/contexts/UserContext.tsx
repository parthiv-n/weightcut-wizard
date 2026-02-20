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
        supabase.auth.getSession(),
        5000
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
        supabase.auth.refreshSession(),
        5000
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
        5000,
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
      }

      // Parallelize profile + weight queries
      const [profileResult, weightResult] = await Promise.allSettled([
        withSupabaseTimeout(
          supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle(),
          5000,
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
          5000,
          "Weight log query"
        ),
      ]);

      // If profile query threw an error (like a timeout) or returned a database error
      // Note: maybeSingle() returns { data: null, error: null } if no row exists, which we treat as a success (auth but no profile)
      const profileError = profileResult.status === "rejected" || (profileResult.status === "fulfilled" && profileResult.value?.error);
      const latestWeightLog = weightResult.status === "fulfilled" ? weightResult.value.data : null;

      if (profileError) {
        console.error("Profile query failed or timed out, triggering retry");
        return 'error';
      }

      const profileData = profileResult.status === "fulfilled" ? profileResult.value.data : null;
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
    const DELAYS = [500, 1000, 2000];

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
    // Safety timer: never show white screen for more than 3s
    const safetyTimer = setTimeout(() => {
      if (!isUserLoadedRef.current) {
        let currentUid = userIdRef.current;

        // Fallback: If INITIAL_SESSION never fired but we have auth in localStorage, salvage it
        if (!currentUid) {
          try {
            const authSaved = localStorage.getItem('weightcut-wizard-auth');
            if (authSaved) {
              const parsed = JSON.parse(authSaved);
              const user = parsed?.user || parsed?.currentSession?.user;
              if (user?.id) {
                console.warn('UserContext: Salvaged userId from localStorage in safety timer');
                setUserId(user.id);
                currentUid = user.id;
                userIdRef.current = user.id;
                setIsSessionValid(true);
              }
            }
          } catch (e) {
            console.error('Failed to parse auth from localStorage in safety timer', e);
          }
        }

        if (currentUid) {
          const cachedProfile = localCache.get<ProfileData>(currentUid, 'profiles');
          if (cachedProfile) {
            console.warn('UserContext: Safety timer fired — salvaging profile from cache & forcing isLoading=false');
            setProfile(cachedProfile);
            profileRef.current = cachedProfile;
            setHasProfile(true);
            if (cachedProfile.avatar_url) setAvatarUrl(cachedProfile.avatar_url);
            if (cachedProfile.current_weight_kg) setCurrentWeight(cachedProfile.current_weight_kg);
            const savedName = localStorage.getItem(`user_name_${currentUid}`);
            if (savedName) setUserName(savedName);

            isUserLoadedRef.current = true;
            setIsLoading(false);
          } else {
            // Very important: if we know they are logged in, but don't have a cached profile,
            // we CANNOT force isLoading=false. If we do, hasProfile=false will route them to onboarding.
            // We must wait for the network to respond to verify if they really need onboarding.
            console.warn('UserContext: Safety timer fired, but no cached profile exists. Waiting for network...');
          }
        } else {
          // No user found in cache or INITIAL_SESSION. We can safely stop loading and let them go to /auth
          console.warn('UserContext: Safety timer fired — no user found, forcing isLoading=false');
          isUserLoadedRef.current = true;
          setIsLoading(false);
        }
      }
    }, 3000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          const uid = session.user.id;
          // Set essential auth state immediately so we don't get booted to login
          setUserId(uid);
          userIdRef.current = uid;
          setIsSessionValid(true);

          // Immediately resolve from cache so routes render right away
          const cachedProfile = localCache.get<ProfileData>(uid, 'profiles');
          if (cachedProfile && !isUserLoadedRef.current) {
            setProfile(cachedProfile);
            profileRef.current = cachedProfile;
            setHasProfile(true);
            if (cachedProfile.avatar_url) setAvatarUrl(cachedProfile.avatar_url);
            if (cachedProfile.current_weight_kg) setCurrentWeight(cachedProfile.current_weight_kg);
            const savedName = localStorage.getItem(`user_name_${uid}`);
            if (savedName) setUserName(savedName);
            isUserLoadedRef.current = true;
            setIsLoading(false);
          }
          // Background refresh from network (won't block UI)
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
        checkSessionValidity();
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
      clearTimeout(safetyTimer);
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
