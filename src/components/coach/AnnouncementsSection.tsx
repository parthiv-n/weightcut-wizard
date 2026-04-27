import { useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useGymAnnouncements } from "@/hooks/coach/useGymAnnouncements";
import { AnnouncementCard } from "./AnnouncementCard";

interface Props {
  /** Gym ids the user is a member of — used to scope realtime channels. */
  gymIds: string[];
}

function SkeletonCard() {
  return (
    <div className="card-surface rounded-2xl border border-border p-3 space-y-2 animate-pulse">
      <div className="h-2.5 w-24 rounded bg-muted/40" />
      <div className="h-2 w-32 rounded bg-muted/30" />
      <div className="h-2 w-full rounded bg-muted/30" />
    </div>
  );
}

export function AnnouncementsSection({ gymIds }: Props) {
  const { userId } = useUser();
  const { announcements, loading, error, refresh, dismiss, vote } = useGymAnnouncements(userId, gymIds);

  const visible = useMemo(() => announcements.slice(0, 50), [announcements]);

  if (loading && announcements.length === 0) {
    return (
      <section className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold px-1">
          Announcements
        </p>
        <SkeletonCard />
      </section>
    );
  }

  // Surface fetch errors so failures aren't invisible
  if (error && announcements.length === 0) {
    return (
      <section className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold px-1">
          Announcements
        </p>
        <div className="card-surface rounded-2xl border border-border p-3">
          <p className="text-[12px] text-muted-foreground">Couldn't load announcements.</p>
          <button
            onClick={refresh}
            className="text-[12px] text-primary font-medium mt-1"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (announcements.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          Announcements
        </p>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          {visible.length}
        </span>
      </div>
      <div
        className="max-h-[60vh] overflow-y-auto overscroll-contain space-y-2 pr-0.5 scrollbar-hide"
        style={{
          scrollSnapType: "y proximity",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {visible.map((a) => (
          <div key={a.id} style={{ scrollSnapAlign: "start" }}>
            <AnnouncementCard
              a={a}
              onDismiss={() => dismiss(a)}
              onVote={(optId) => vote(a, optId)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
