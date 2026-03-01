import { Flame, Calendar, Utensils, Trophy, Scale, TrendingUp, Award, Zap, Star, Dumbbell, Crown, Check, ChevronRight } from "lucide-react";
import type { MilestoneBadge } from "@/hooks/useGamification";

const iconMap = {
  Flame, Calendar, Utensils, Trophy, Scale, TrendingUp, Award, Zap, Star, Dumbbell, Crown,
} as const;

interface MilestoneBadgesProps {
  badges: MilestoneBadge[];
  loading: boolean;
  onTap?: () => void;
}

function BadgeSkeleton() {
  return (
    <div className="w-28 flex-shrink-0 rounded-xl border border-border/50 p-3 text-center glass-card">
      <div className="w-10 h-10 rounded-full mx-auto bg-muted/20 animate-pulse" />
      <div className="h-3 w-16 mx-auto mt-2 rounded bg-muted/20 animate-pulse" />
      <div className="h-1 w-full mt-2 rounded-full bg-muted/20 animate-pulse" />
    </div>
  );
}

export function MilestoneBadges({ badges, loading, onTap }: MilestoneBadgesProps) {
  if (loading) {
    return (
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Achievements
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <BadgeSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const Wrapper = onTap ? "button" : "div";

  return (
    <Wrapper
      {...(onTap ? { onClick: onTap, type: "button" as const } : {})}
      className={onTap ? "w-full text-left active:scale-[0.98] transition-transform" : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Achievements
        </div>
        {onTap && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {badges.map((badge) => {
          const Icon = iconMap[badge.icon];
          return (
            <div
              key={badge.id}
              className="w-28 flex-shrink-0 rounded-xl border border-border/50 p-3 text-center glass-card"
            >
              {/* Icon circle */}
              <div
                className={`w-10 h-10 rounded-full mx-auto flex items-center justify-center ${
                  badge.unlocked
                    ? "bg-primary/20"
                    : "bg-muted/20"
                }`}
                style={
                  badge.unlocked
                    ? { boxShadow: "0 0 12px hsl(var(--primary) / 0.3)" }
                    : undefined
                }
              >
                {badge.unlocked ? (
                  <Icon className="h-5 w-5 text-primary" />
                ) : (
                  <Icon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              {/* Title + checkmark */}
              <div className="flex items-center justify-center gap-1 mt-2">
                <span className="text-xs font-semibold truncate">
                  {badge.title}
                </span>
                {badge.unlocked && (
                  <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                )}
              </div>

              {/* Progress bar */}
              {!badge.unlocked && (
                <div className="h-1 rounded-full bg-muted mt-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${badge.progress * 100}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Wrapper>
  );
}
