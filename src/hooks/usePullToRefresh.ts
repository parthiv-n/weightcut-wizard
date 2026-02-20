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

    // Refs to track touch state without re-renders
    const startY = useRef(0);
    const isPulling = useRef(false);
    const hasTriggeredHaptic = useRef(false);

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
            // Only start pull tracking when scrolled to top
            if (el.scrollTop <= 0 && !isRefreshing) {
                startY.current = e.touches[0].clientY;
                isPulling.current = true;
                hasTriggeredHaptic.current = false;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isPulling.current || isRefreshing) return;

            const currentY = e.touches[0].clientY;
            const diff = currentY - startY.current;

            if (diff > 0 && el.scrollTop <= 0) {
                // Apply resistance: the further you pull, the harder it gets
                const resistedDiff = Math.min(diff * 0.5, 150);
                setPullDistance(resistedDiff);

                // Haptic feedback when crossing the threshold
                if (resistedDiff >= PULL_THRESHOLD && !hasTriggeredHaptic.current) {
                    hasTriggeredHaptic.current = true;
                    triggerHaptic(ImpactStyle.Heavy);
                }

                // Prevent default scroll when pulling down from top
                if (diff > 10) {
                    e.preventDefault();
                }
            } else {
                // User scrolled back up or container is not at top
                setPullDistance(0);
                isPulling.current = false;
            }
        };

        const onTouchEnd = () => {
            if (!isPulling.current) return;
            isPulling.current = false;

            if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
                handleRefresh();
            } else {
                setPullDistance(0);
            }
        };

        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: true });

        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
        };
    }, [isRefreshing, pullDistance, handleRefresh]);

    return { pullDistance, isRefreshing, containerRef, PULL_THRESHOLD };
}
