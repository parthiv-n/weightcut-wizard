export type MedalTier = "gold" | "silver" | "bronze";

export type LeaderboardEntry = {
  userId: string;
  rank: number;
  totalMinutes: number;
  sessionCount: number;
  topDiscipline: string;
  name: string;
  avatarUrl: string | null;
};

export type MyRankInfo = {
  rank: number | null;
  totalMinutes: number;
  topDiscipline: string | null;
};

export type LeaderboardData = {
  podium: LeaderboardEntry[];
  ranks: LeaderboardEntry[];
  myRank: MyRankInfo | null;
  asOf: number;
  windowStart: string;
  windowEnd: string;
  totalRankedFighters: number;
};

export function rankToTier(rank: number): MedalTier | null {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return null;
}
