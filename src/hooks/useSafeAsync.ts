import { useEffect, useRef, useCallback } from "react";

/**
 * Hook that tracks component mount state to prevent setState on unmounted components.
 * Returns `safeAsync(fn)` which only calls `fn` if the component is still mounted,
 * and `isMounted()` for early-return checks in long async chains.
 */
export function useSafeAsync() {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isMounted = useCallback(() => mountedRef.current, []);

  const safeAsync = useCallback(<T extends (...args: any[]) => any>(fn: T) => {
    return ((...args: Parameters<T>) => {
      if (mountedRef.current) {
        return fn(...args);
      }
    }) as T;
  }, []);

  return { safeAsync, isMounted };
}
