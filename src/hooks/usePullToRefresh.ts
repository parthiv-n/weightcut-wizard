import { useRef, useState, useCallback, useEffect } from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const PULL_THRESHOLD = 80;
const SCROLL_COOLDOWN_MS = 300;

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

    // Refs to track touch state without re-renders
    const startY = useRef(0);
    const startX = useRef(0);
    const isPulling = useRef(false);
    const isGestureLocked = useRef(false); // Once locked, we either refresh or ignore
    const hasTriggeredHaptic = useRef(false);
    const lastScrollTime = useRef(0);

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
            setPullDistance(0);
        }
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onTouchStart = (e: TouchEvent) => {
            // STRICT RULE: User MUST be at the absolute top of the scroll container to even begin a pull
            const scrollCooledDown = Date.now() - lastScrollTime.current > SCROLL_COOLDOWN_MS;
            if (el.scrollTop <= 0 && !isRefreshing && scrollCooledDown) {
                startY.current = e.touches[0].clientY;
                startX.current = e.touches[0].clientX;
                isPulling.current = true;
                isGestureLocked.current = false;
                hasTriggeredHaptic.current = false;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isPulling.current || isRefreshing) return;

            // If we've scrolled down at all during the pull, cancel the pull instantly
            if (el.scrollTop > 0) {
                isPulling.current = false;
                setPullDistance(0);
                return;
            }

            const currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            const diffY = currentY - startY.current;
            const diffX = Math.abs(currentX - startX.current);

            // Phase 1: Deadzone & Directional Check (Only run before gesture is locked)
            if (!isGestureLocked.current) {
                // If they swipe left/right more than 15px BEFORE wiping down 15px, cancel the pull.
                if (diffX > 15 && diffX > diffY) {
                    isPulling.current = false;
                    return;
                }

                // If they haven't pulled down at least 15px yet, do nothing (Deadzone)
                if (diffY < 15) {
                    return;
                }

                // If we pass the deadzone strictly downwards while at the top, lock it in!
                isGestureLocked.current = true;
            }

            // Phase 2: Active Pulling
            if (isGestureLocked.current && diffY > 0) {
                // Apply a tight iOS native-feeling resistance curve
                // diffY squared logic slows it down dramatically the further you pull
                const resistedDiff = Math.min(diffY * 0.4, 100);
                setPullDistance(resistedDiff);

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
            if (!isPulling.current) return;
            isPulling.current = false;
            isGestureLocked.current = false;

            if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
                handleRefresh();
            } else {
                setPullDistance(0);
            }
        };

        const onScroll = () => {
            lastScrollTime.current = Date.now();
            // Failsafe: if the container scrolls natively, terminate the artificial pull
            if (el.scrollTop > 0 && isPulling.current) {
                isPulling.current = false;
                isGestureLocked.current = false;
                setPullDistance(0);
            }
        };

        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
        el.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            el.removeEventListener('scroll', onScroll);
        };
    }, [isRefreshing, pullDistance, handleRefresh]);

    return { pullDistance, isRefreshing, containerRef, PULL_THRESHOLD };
}
