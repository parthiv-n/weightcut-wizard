import React, { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface PullToRefreshProps {
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, className = '', disabled = false }) => {
    const { pullDistance, isRefreshing, containerRef, PULL_THRESHOLD } = usePullToRefresh();
    const { pathname } = useLocation();

    // Reset scroll position before paint when navigating to a new page
    useLayoutEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
        window.scrollTo(0, 0);
    }, [pathname]);

    if (disabled) {
        return <main className={className}>{children}</main>;
    }

    // Normalised progress 0→1 based on threshold
    const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
    const isPastThreshold = pullDistance >= PULL_THRESHOLD;

    return (
        <main
            ref={containerRef}
            className={className}
            style={{ position: 'relative', overscrollBehaviorY: 'contain' }}
        >
            {/* iOS-style modern floating pill indicator */}
            <div
                className="absolute top-0 left-0 right-0 flex justify-center z-50 pointer-events-none"
                style={{
                    transform: `translateY(${isRefreshing ? 60 : pullDistance > 0 ? pullDistance : -60}px)`,
                    opacity: isRefreshing ? 1 : progress,
                    transition: pullDistance === 0 && !isRefreshing ? 'all 0.4s cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
                }}
            >
                <div className="bg-background/95 backdrop-blur-md shadow-md border rounded-full h-10 w-10 flex items-center justify-center">
                    {isRefreshing ? (
                        <div className="h-5 w-5 border-2 border-muted-foreground border-t-foreground rounded-full animate-spin" />
                    ) : (
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-foreground transition-transform duration-200"
                            style={{
                                transform: `rotate(${isPastThreshold ? 180 : 0}deg) scale(${progress * 0.8 + 0.2})`,
                            }}
                        >
                            <path d="M12 5v14M19 12l-7 7-7-7" />
                        </svg>
                    )}
                </div>
            </div>

            {/* Page content — spring back down gracefully */}
            <div
                style={{
                    transform: `translateY(${isRefreshing ? 60 : pullDistance > 0 ? pullDistance : 0}px)`,
                    transition: pullDistance === 0 && !isRefreshing ? 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
                    minHeight: '100%',
                }}
            >
                {children}
            </div>
        </main>
    );
};

export default PullToRefresh;
