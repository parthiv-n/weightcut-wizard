import { describe, expect, it } from "vitest";
import { assignRanks } from "../../convex/lib/leaderboardAggregation";

describe("assignRanks", () => {
  it("returns empty for empty input", () => {
    expect(assignRanks([])).toEqual([]);
  });

  it("ranks by descending totalMinutes", () => {
    const ranked = assignRanks([
      { userId: "a", totalMinutes: 100, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "b", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "c", totalMinutes: 200, sessionCount: 1, topDiscipline: "BJJ" },
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["b", "c", "a"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("preserves ties with 1, 1, 3 style ranking", () => {
    const ranked = assignRanks([
      { userId: "a", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "b", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "c", totalMinutes: 200, sessionCount: 1, topDiscipline: "BJJ" },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("preserves three-way tie at top", () => {
    const ranked = assignRanks([
      { userId: "a", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "b", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "c", totalMinutes: 300, sessionCount: 1, topDiscipline: "BJJ" },
      { userId: "d", totalMinutes: 100, sessionCount: 1, topDiscipline: "BJJ" },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });
});
