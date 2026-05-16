import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  DisciplineFilterTabs,
  type DisciplineFilter,
} from "./DisciplineFilterTabs";
import { PodiumHero } from "./PodiumHero";
import { RankedList } from "./RankedList";
import { MyRankFooter } from "./MyRankFooter";
import type { LeaderboardData } from "./types";

const FILTER_TO_DISCIPLINE: Record<DisciplineFilter, string | undefined> = {
  All: undefined,
  BJJ: "BJJ",
  Boxing: "Boxing",
  "Muay Thai": "Muay Thai",
  Wrestling: "Wrestling",
  Sparring: "Sparring",
  Strength: "Strength",
};

function SkeletonRow() {
  return <div className="h-12 animate-pulse rounded-xl bg-card/40" />;
}

export function LeaderboardSection({
  gymId,
  viewer,
  onRowClick,
}: {
  gymId: Id<"gyms">;
  viewer: "coach" | "athlete";
  onRowClick?: (userId: string) => void;
}) {
  const [filter, setFilter] = useState<DisciplineFilter>("All");
  const data = useQuery(api.gymLeaderboard.weekly, {
    gymId,
    discipline: FILTER_TO_DISCIPLINE[filter],
  }) as LeaderboardData | null | undefined;

  // Loading state
  if (data === undefined) {
    return (
      <section className="space-y-3">
        <DisciplineFilterTabs value={filter} onChange={setFilter} />
        <div className="space-y-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </section>
    );
  }

  // Caller opted out
  if (data === null) {
    return (
      <section className="glass-card rounded-2xl border border-border/50 p-4 text-sm text-muted-foreground">
        Enable data sharing in this gym's settings to see the leaderboard.
      </section>
    );
  }

  const { podium, ranks, myRank, totalRankedFighters } = data;

  // Empty
  if (totalRankedFighters === 0) {
    return (
      <section className="space-y-3">
        <DisciplineFilterTabs value={filter} onChange={setFilter} />
        <div className="glass-card rounded-2xl border border-border/50 p-4 text-center text-sm text-muted-foreground">
          {filter === "All"
            ? "Be the first to train this week."
            : `No ${filter} training logged this week.`}
        </div>
      </section>
    );
  }

  const showPodium = totalRankedFighters >= 3;

  return (
    <section className="space-y-3">
      <DisciplineFilterTabs value={filter} onChange={setFilter} />
      {showPodium ? (
        <PodiumHero podium={podium} />
      ) : (
        <div className="glass-card rounded-2xl border border-border/50 p-3 text-center text-xs text-muted-foreground">
          Need 3+ active fighters to rank a podium.
        </div>
      )}
      <RankedList ranks={ranks} onRowClick={onRowClick} />
      {viewer === "athlete" && myRank ? (
        <MyRankFooter myRank={myRank} podium={podium} />
      ) : null}
    </section>
  );
}
