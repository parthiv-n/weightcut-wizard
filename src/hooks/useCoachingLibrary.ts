import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withRetry, withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { localCache } from "@/lib/localCache";
import { logger } from "@/lib/logger";

export interface CoachingLibraryEntry {
  id: string;
  user_id: string;
  session_type: string;
  session_id: string | null;
  session_date: string | null;
  fingerprint: string;
  insight_data: {
    session_type?: string;
    last_logged?: string;
    what_you_did?: string;
    next_focus?: string;
    [k: string]: unknown;
  };
  created_at: string;
}

const PAGE_SIZE = 30;
const FRESH_WINDOW_MS = 30 * 1000;
const CACHE_KEY = "coaching_library_index";

// Module-level memCache survives remounts within a session — first paint is
// instant after the user has opened the library once.
type CacheEntry = { data: CoachingLibraryEntry[]; fetchedAt: number; allLoaded: boolean };
const memCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CoachingLibraryEntry[]>>();

async function fetchPage(
  userId: string,
  cursor: string | null
): Promise<CoachingLibraryEntry[]> {
  let q = supabase
    .from("coaching_library")
    .select("id, user_id, session_type, session_id, session_date, fingerprint, insight_data, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await withRetry(
    () => withSupabaseTimeout(q, 8000, "Fetch coaching library page"),
    1,
    500
  );
  if (error) throw error;
  return (data ?? []) as CoachingLibraryEntry[];
}

export function useCoachingLibrary(userId: string | null, enabled: boolean) {
  const [entries, setEntries] = useState<CoachingLibraryEntry[]>(() => {
    if (!userId) return [];
    return memCache.get(userId)?.data
      ?? localCache.get<CoachingLibraryEntry[]>(userId, CACHE_KEY)
      ?? [];
  });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allLoaded, setAllLoaded] = useState(() => {
    if (!userId) return false;
    return memCache.get(userId)?.allLoaded ?? false;
  });
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const loadInitial = useCallback(async () => {
    if (!userId) return;
    cancelledRef.current = false;

    const mem = memCache.get(userId);
    const cached = mem?.data ?? localCache.get<CoachingLibraryEntry[]>(userId, CACHE_KEY);
    if (cached) {
      setEntries(cached);
      setAllLoaded(mem?.allLoaded ?? false);
      // Skip refetch when memCache is fresh
      if (mem && Date.now() - mem.fetchedAt < FRESH_WINDOW_MS) return;
    } else {
      setLoading(true);
    }

    const inflightKey = `${userId}:initial`;
    let promise = inflight.get(inflightKey);
    if (!promise) {
      promise = fetchPage(userId, null);
      inflight.set(inflightKey, promise);
    }

    try {
      const rows = await promise;
      if (cancelledRef.current) return;
      const allDone = rows.length < PAGE_SIZE;
      memCache.set(userId, { data: rows, fetchedAt: Date.now(), allLoaded: allDone });
      localCache.set(userId, CACHE_KEY, rows);
      setEntries(rows);
      setAllLoaded(allDone);
      setError(null);
    } catch (err) {
      if (cancelledRef.current) return;
      logger.warn("coaching library initial fetch failed", { err });
      if (!cached) setError("Could not load your library.");
    } finally {
      inflight.delete(inflightKey);
      if (!cancelledRef.current) setLoading(false);
    }
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!userId || allLoaded || loadingMore || entries.length === 0) return;
    setLoadingMore(true);
    const cursor = entries[entries.length - 1].created_at;
    try {
      const rows = await fetchPage(userId, cursor);
      const merged = [...entries, ...rows];
      const allDone = rows.length < PAGE_SIZE;
      memCache.set(userId, { data: merged, fetchedAt: Date.now(), allLoaded: allDone });
      localCache.set(userId, CACHE_KEY, merged);
      setEntries(merged);
      setAllLoaded(allDone);
    } catch (err) {
      logger.warn("coaching library load-more failed", { err });
      setError("Couldn't load more entries.");
    } finally {
      setLoadingMore(false);
    }
  }, [userId, entries, allLoaded, loadingMore]);

  useEffect(() => {
    if (!enabled || !userId) return;
    loadInitial();
    return () => {
      cancelledRef.current = true;
    };
  }, [enabled, userId, loadInitial]);

  return { entries, loading, loadingMore, allLoaded, error, loadMore, refresh: loadInitial };
}
