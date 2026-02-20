import { useRef, useState, useCallback, type ReactNode } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

interface PullToRefreshProps {
    onRefresh: () => Promise<void> | void;
    children: ReactNode;
    /** Pull distance (px) needed to trigger refresh */
    threshold?: number;
}

export default function PullToRefresh({
    onRefresh,
    children,
    threshold = 70,
}: PullToRefreshProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const pulling = useRef(false);
    const hapticked = useRef(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    const triggerHaptic = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                await Haptics.impact({ style: ImpactStyle.Medium });
            } catch {
                // Haptics not available
            }
        }
    }, []);

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (refreshing) return;
            const el = containerRef.current;
            // Only activate when scrolled to the very top
            if (el && el.scrollTop <= 0) {
                startY.current = e.touches[0].clientY;
                pulling.current = true;
                hapticked.current = false;
            }
        },
        [refreshing]
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!pulling.current || refreshing) return;
            const deltaY = e.touches[0].clientY - startY.current;
            if (deltaY < 0) {
                // Scrolling up — ignore
                setPullDistance(0);
                return;
            }
            // Apply resistance: the further you pull, the slower it moves
            const dampened = Math.min(deltaY * 0.45, threshold * 1.8);
            setPullDistance(dampened);

            // Haptic feedback when crossing the activation threshold
            if (dampened >= threshold && !hapticked.current) {
                hapticked.current = true;
                triggerHaptic();
            } else if (dampened < threshold) {
                hapticked.current = false;
            }
        },
        [refreshing, threshold, triggerHaptic]
    );

    const handleTouchEnd = useCallback(async () => {
        if (!pulling.current) return;
        pulling.current = false;

        if (pullDistance >= threshold) {
            setRefreshing(true);
            setPullDistance(threshold * 0.6); // Settle the spinner into a resting position
            try {
                await onRefresh();
            } catch (err) {
                console.error("Pull-to-refresh error:", err);
            } finally {
                setRefreshing(false);
                setPullDistance(0);
            }
        } else {
            setPullDistance(0);
        }
    }, [pullDistance, threshold, onRefresh]);

    const progress = Math.min(pullDistance / threshold, 1);

    return (
        <div
            ref={containerRef}
            className="pull-to-refresh-container"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Indicator */}
            <div
                className="pull-to-refresh-indicator"
                style={{
                    height: `${pullDistance}px`,
                    opacity: refreshing ? 1 : progress,
                }}
            >
                <div
                    className={`pull-to-refresh-spinner ${refreshing ? "spinning" : ""}`}
                    style={{
                        transform: refreshing
                            ? undefined
                            : `rotate(${progress * 360}deg) scale(${0.5 + progress * 0.5})`,
                    }}
                />
            </div>

            {/* Page content – translated down while pulling */}
            <div
                className="pull-to-refresh-content"
                style={{
                    transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
                    transition: pulling.current ? "none" : "transform 0.3s ease-out",
                }}
            >
                {children}
            </div>
        </div>
    );
}
