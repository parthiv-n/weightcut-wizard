import React from 'react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface PullToRefreshProps {
    children: React.ReactNode;
    className?: string;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, className = '' }) => {
    const { pullDistance, isRefreshing, containerRef, PULL_THRESHOLD } = usePullToRefresh();

    // Normalised progress 0→1 based on threshold
    const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
    const isPastThreshold = pullDistance >= PULL_THRESHOLD;

    return (
        <main
            ref={containerRef}
            className={className}
            style={{ position: 'relative', overscrollBehaviorY: 'contain' }}
        >
            {/* Pull-to-refresh indicator */}
            <div
                className="pull-to-refresh-indicator"
                style={{
                    transform: `translateY(${pullDistance > 0 || isRefreshing ? 0 : -60}px)`,
                    height: isRefreshing ? 60 : pullDistance > 0 ? pullDistance : 0,
                    opacity: isRefreshing ? 1 : progress,
                    transition: pullDistance === 0 && !isRefreshing ? 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                }}
            >
                <div className="pull-to-refresh-content">
                    {isRefreshing ? (
                        <div className="pull-to-refresh-spinner" />
                    ) : (
                        <svg
                            className="pull-to-refresh-arrow"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                                transform: `rotate(${isPastThreshold ? 180 : 0}deg)`,
                                transition: 'transform 0.2s ease',
                            }}
                        >
                            <line x1="12" y1="19" x2="12" y2="5" />
                            <polyline points="5 12 12 5 19 12" />
                        </svg>
                    )}
                    <span className="pull-to-refresh-text">
                        {isRefreshing ? 'Refreshing…' : isPastThreshold ? 'Release to refresh' : 'Pull to refresh'}
                    </span>
                </div>
            </div>

            {/* Page content — translate down while pulling */}
            <div
                style={{
                    transform: `translateY(${isRefreshing ? 60 : pullDistance > 0 ? pullDistance : 0}px)`,
                    transition: pullDistance === 0 && !isRefreshing ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                    minHeight: '100%',
                }}
            >
                {children}
            </div>
        </main>
    );
};

export default PullToRefresh;
