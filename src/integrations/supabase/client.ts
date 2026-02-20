import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// iOS-safe storage adapter using Capacitor Preferences instead of localStorage.
// On native platforms, localStorage is unreliable (WKWebView can purge it).
// Capacitor Preferences uses UserDefaults (iOS) / SharedPreferences (Android).
// Falls back to localStorage on web for compatibility.
const capacitorStorage = Capacitor.isNativePlatform()
  ? {
      getItem: async (key: string): Promise<string | null> => {
        const { value } = await Preferences.get({ key });
        return value;
      },
      setItem: async (key: string, value: string): Promise<void> => {
        await Preferences.set({ key, value });
      },
      removeItem: async (key: string): Promise<void> => {
        await Preferences.remove({ key });
      },
    }
  : localStorage;

// Single Supabase client instance — do NOT call createClient() anywhere else.
// Import as: import { supabase } from "@/integrations/supabase/client";
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: capacitorStorage,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'weightcut-wizard-auth',
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

console.debug('[supabase] Client initialised', {
  platform: Capacitor.getPlatform(),
  native: Capacitor.isNativePlatform(),
});
