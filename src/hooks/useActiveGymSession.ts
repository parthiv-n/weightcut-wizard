import { useState, useEffect } from "react";

const ACTIVE_SESSION_KEY = "wcw_active_gym_session";

/** Shared hook — single 2s poll for active gym session. Prevents duplicate intervals. */
export function useActiveGymSession() {
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    const check = () => {
      try {
        const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setStartedAt(parsed.startedAt || null);
        } else {
          setStartedAt(null);
        }
      } catch {
        setStartedAt(null);
      }
    };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  return { isActive: startedAt !== null, startedAt };
}
