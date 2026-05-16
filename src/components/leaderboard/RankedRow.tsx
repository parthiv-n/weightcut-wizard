import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { LeaderboardEntry } from "./types";

export function RankedRow({
  entry,
  onClick,
}: {
  entry: LeaderboardEntry;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
        interactive ? "hover:bg-card/50" : "cursor-default"
      }`}
    >
      <div className="w-6 text-sm text-muted-foreground tabular-nums">
        #{entry.rank}
      </div>
      <Avatar className="h-8 w-8">
        <AvatarImage src={entry.avatarUrl ?? undefined} alt={entry.name} />
        <AvatarFallback>{entry.name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 truncate text-sm">{entry.name}</div>
      <div className="text-xs text-muted-foreground">{entry.topDiscipline}</div>
      <div className="w-16 text-right text-sm font-medium tabular-nums">
        {entry.totalMinutes} min
      </div>
    </button>
  );
}
