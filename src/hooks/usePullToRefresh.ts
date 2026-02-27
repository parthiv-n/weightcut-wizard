import { useRef, useState, useCallback, useEffect } from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const PULL_THRESHOLD = 80;

const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Medium) => {
    try {
        await Haptics.impact({ style });
    } catch {
        // Haptics not available (web browser) – silently ignore
    }
};

export function usePullToRefresh() {
    const containerRef = useRef<HTMLElement>(null);
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Ref-based pull distance — avoids stale closures & effect re-runs
    const pullDistanceRef = useRef(0);
    const rafId = useRef(0);

    const updatePullDistance = useCallback((value: number) => {
        pullDistanceRef.current = value;
        cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(() => setPullDistance(value));
    }, []);

    // Touch state refs
    const startY = useRef(0);
    const startX = useRef(0);
    const isPulling = useRef(false);
    const isGestureLocked = useRef(false);
    const hasTriggeredHaptic = useRef(false);

    // Settled-at-top tracking
    const isSettledAtTop = useRef(true); // Page starts at top
    const settledTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Scroll velocity tracking
    const lastScrollTop = useRef(0);
    const lastScrollTime = useRef(0);
    const scrollVelocity = useRef(0);

    // Safety timeout to prevent stuck pull state
    const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSafetyTimer = useCallback(() => {
        if (safetyTimer.current) {
            clearTimeout(safetyTimer.current);
            safetyTimer.current = null;
        }
    }, []);

    const cancelPull = useCallback(() => {
        isPulling.current = false;
        isGestureLocked.current = false;
        updatePullDistance(0);
        clearSafetyTimer();
    }, [updatePullDistance, clearSafetyTimer]);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        await triggerHaptic(ImpactStyle.Medium);

        try {
            // Force a hard reload of the app window resolving connection hangs
            window.location.reload();
        } finally {
            // Small delay so the user sees the spinner
            await new Promise((r) => setTimeout(r, 600));
            await triggerHaptic(ImpactStyle.Light);
            setIsRefreshing(false);
            updatePullDistance(0);
        }
    }, [updatePullDistance]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onTouchStart = (e: TouchEvent) => {
            // Not at top — scrollTop > 0 means not at top, negative means iOS rubber-band
            if (el.scrollTop !== 0) return;
            if (isRefreshing) return;

            // Must be settled (momentum fully stopped)
            if (!isSettledAtTop.current) return;

            // Recent scroll activity — momentum may still be decelerating
            const timeSinceLastScroll = performance.now() - lastScrollTime.current;
            if (timeSinceLastScroll < 300) return;

            startY.current = e.touches[0].clientY;
            startX.current = e.touches[0].clientX;
            isPulling.current = true;
            isGestureLocked.current = false;
            hasTriggeredHaptic.current = false;

            // Safety timeout: auto-cancel if touchend never fires within 3s
            clearSafetyTimer();
            safetyTimer.current = setTimeout(() => {
                if (isPulling.current) {
                    cancelPull();
                }
            }, 3000);
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isPulling.current || isRefreshing) return;

            // If we've scrolled down at all during the pull, cancel instantly
            if (el.scrollTop > 0) {
                cancelPull();
                return;
            }

            const currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            const diffY = currentY - startY.current;
            const diffX = Math.abs(currentX - startX.current);

            // Phase 1: Deadzone & Directional Check (before gesture is locked)
            if (!isGestureLocked.current) {
                // Horizontal swipe detected — cancel pull
                if (diffX > 15 && diffX > diffY) {
                    isPulling.current = false;
                    clearSafetyTimer();
                    return;
                }

                // Haven't pulled down enough yet (deadzone)
                if (diffY < 15) {
                    return;
                }

                // Past deadzone strictly downwards while at top — lock it in
                isGestureLocked.current = true;
            }

            // Phase 2: Active Pulling
            if (isGestureLocked.current && diffY > 0) {
                const resistedDiff = Math.min(diffY * 0.4, 100);
                updatePullDistance(resistedDiff);

                // Haptic feedback when crossing the threshold
                if (resistedDiff >= PULL_THRESHOLD && !hasTriggeredHaptic.current) {
                    hasTriggeredHaptic.current = true;
                    triggerHaptic(ImpactStyle.Heavy);
                }

                // Prevent default scroll to stop Safari from rubber-banding the whole page
                e.preventDefault();
            }
        };

        const onTouchEnd = () => {
            clearSafetyTimer();
            if (!isPulling.current) return;
            isPulling.current = false;
            isGestureLocked.current = false;

            if (pullDistanceRef.current >= PULL_THRESHOLD && !isRefreshing) {
                handleRefresh();
            } else {
                updatePullDistance(0);
            }
        };

        const onScroll = () => {
            // Track velocity
            const now = performance.now();
            const dt = now - lastScrollTime.current;
            if (dt > 0) {
                scrollVelocity.current = Math.abs(el.scrollTop - lastScrollTop.current) / dt;
            }
            lastScrollTop.current = el.scrollTop;
            lastScrollTime.current = now;

            // Any scroll means we're not settled
            isSettledAtTop.current = false;
            if (settledTimer.current) clearTimeout(settledTimer.current);

            // If at top, start a debounce to mark as settled once momentum + velocity stop
            if (el.scrollTop <= 0) {
                settledTimer.current = setTimeout(() => {
                    if (el.scrollTop <= 0 && scrollVelocity.current < 0.1) {
                        isSettledAtTop.current = true;
                    }
                }, 800);
            }

            // Failsafe: if the container scrolls natively, terminate the artificial pull
            if (el.scrollTop > 0 && isPulling.current) {
                cancelPull();
            }
        };

        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
        el.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            if (settledTimer.current) clearTimeout(settledTimer.current);
            clearSafetyTimer();
            cancelAnimationFrame(rafId.current);
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            el.removeEventListener('scroll', onScroll);
        };
    }, [isRefreshing, handleRefresh, updatePullDistance, cancelPull, clearSafetyTimer]);

    return { pullDistance, isRefreshing, containerRef, PULL_THRESHOLD };
}
