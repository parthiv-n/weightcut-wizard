/**
 * Pure aggregation + ranking helpers for the gym weekly leaderboard.
 *
 * Kept dependency-free (no Convex imports) so the logic is unit-testable
 * without a Convex test harness. The query in `convex/gymLeaderboard.ts`
 * is responsible for fetching rows and feeding them in.
 */

export type LeaderboardSourceRow = {
  userId: string;
  durationMinutes: number;
  sessionType: string;
};

export type AggregatedLeaderboardEntry = {
  userId: string;
  totalMinutes: number;
  sessionCount: number;
  topDiscipline: string;
};

const MIN_SESSION_MINUTES = 30;

export function aggregateLeaderboard(input: {
  rows: LeaderboardSourceRow[];
  shareDataUserIds: Set<string>;
  discipline?: string;
}): AggregatedLeaderboardEntry[] {
  const { rows, shareDataUserIds, discipline } = input;

  // Per-user totals plus per-discipline minutes for picking topDiscipline.
  const perUser = new Map<
    string,
    {
      totalMinutes: number;
      sessionCount: number;
      perDiscipline: Map<string, number>;
    }
  >();

  for (const row of rows) {
    if (row.durationMinutes < MIN_SESSION_MINUTES) continue;
    if (!shareDataUserIds.has(row.userId)) continue;
    if (discipline && row.sessionType !== discipline) continue;

    const existing = perUser.get(row.userId) ?? {
      totalMinutes: 0,
      sessionCount: 0,
      perDiscipline: new Map<string, number>(),
    };
    existing.totalMinutes += row.durationMinutes;
    existing.sessionCount += 1;
    existing.perDiscipline.set(
      row.sessionType,
      (existing.perDiscipline.get(row.sessionType) ?? 0) + row.durationMinutes,
    );
    perUser.set(row.userId, existing);
  }

  const result: AggregatedLeaderboardEntry[] = [];
  for (const [userId, v] of perUser) {
    let topDiscipline = "";
    let topMinutes = -1;
    for (const [d, m] of v.perDiscipline) {
      if (m > topMinutes) {
        topMinutes = m;
        topDiscipline = d;
      }
    }
    result.push({
      userId,
      totalMinutes: v.totalMinutes,
      sessionCount: v.sessionCount,
      topDiscipline,
    });
  }
  return result;
}
