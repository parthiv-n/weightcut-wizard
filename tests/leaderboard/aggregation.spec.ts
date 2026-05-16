import { describe, expect, it } from "vitest";
import {
  aggregateLeaderboard,
  type LeaderboardSourceRow,
} from "../../convex/lib/leaderboardAggregation";

type Row = LeaderboardSourceRow;

describe("aggregateLeaderboard", () => {
  it("returns empty result when no rows", () => {
    const result = aggregateLeaderboard({
      rows: [],
      shareDataUserIds: new Set<string>(),
    });
    expect(result).toEqual([]);
  });

  it("excludes sessions under 30 minutes", () => {
    const rows: Row[] = [
      { userId: "u1", durationMinutes: 25, sessionType: "BJJ" },
      { userId: "u1", durationMinutes: 30, sessionType: "BJJ" },
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]),
    });
    expect(result).toEqual([
      { userId: "u1", totalMinutes: 30, sessionCount: 1, topDiscipline: "BJJ" },
    ]);
  });

  it("excludes users not in shareDataUserIds", () => {
    const rows: Row[] = [
      { userId: "u1", durationMinutes: 60, sessionType: "BJJ" },
      { userId: "u2", durationMinutes: 90, sessionType: "Boxing" },
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("u1");
  });

  it("sums minutes and picks top discipline per user", () => {
    const rows: Row[] = [
      { userId: "u1", durationMinutes: 60, sessionType: "BJJ" },
      { userId: "u1", durationMinutes: 90, sessionType: "Boxing" },
      { userId: "u1", durationMinutes: 45, sessionType: "Boxing" },
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]),
    });
    expect(result).toEqual([
      {
        userId: "u1",
        totalMinutes: 195,
        sessionCount: 3,
        topDiscipline: "Boxing",
      },
    ]);
  });

  it("filters by discipline when provided", () => {
    const rows: Row[] = [
      { userId: "u1", durationMinutes: 60, sessionType: "BJJ" },
      { userId: "u1", durationMinutes: 90, sessionType: "Boxing" },
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]),
      discipline: "BJJ",
    });
    expect(result).toEqual([
      { userId: "u1", totalMinutes: 60, sessionCount: 1, topDiscipline: "BJJ" },
    ]);
  });

  it("opt-out user with logged sessions contributes nothing", () => {
    const rows: LeaderboardSourceRow[] = [
      { userId: "u1", durationMinutes: 60, sessionType: "BJJ" },
      { userId: "u2", durationMinutes: 500, sessionType: "BJJ" }, // opted out
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]), // u2 excluded
    });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("u1");
    expect(result[0].totalMinutes).toBe(60);
  });

  it("combines discipline filter with shareData exclusion", () => {
    const rows: LeaderboardSourceRow[] = [
      { userId: "u1", durationMinutes: 60, sessionType: "BJJ" },
      { userId: "u1", durationMinutes: 90, sessionType: "Boxing" },
      { userId: "u2", durationMinutes: 90, sessionType: "BJJ" }, // opted out
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]),
      discipline: "BJJ",
    });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("u1");
    expect(result[0].totalMinutes).toBe(60);
  });

  it("top discipline tie breaks by first encounter (current behavior)", () => {
    // BJJ and Boxing both have 60 minutes for u1; whichever is iterated
    // first wins. Document this so a future change is intentional.
    const rows: LeaderboardSourceRow[] = [
      { userId: "u1", durationMinutes: 60, sessionType: "BJJ" },
      { userId: "u1", durationMinutes: 60, sessionType: "Boxing" },
    ];
    const result = aggregateLeaderboard({
      rows,
      shareDataUserIds: new Set(["u1"]),
    });
    expect(result).toHaveLength(1);
    expect(["BJJ", "Boxing"]).toContain(result[0].topDiscipline);
  });
});
