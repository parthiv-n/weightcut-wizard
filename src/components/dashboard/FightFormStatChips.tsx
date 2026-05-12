type Props = {
  weight: { current: number; goal: number; pctComplete: number } | null;
  campAge: { weeksAhead: number } | null;
};

export function FightFormStatChips({ weight, campAge }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 px-1">
      <div className="card-surface rounded-2xl p-3">
        <div className="section-header mb-1">Weight</div>
        {weight ? (
          <>
            <div className="display-number text-base">
              {weight.current.toFixed(1)} → {weight.goal.toFixed(1)} kg
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {Math.round(weight.pctComplete * 100)}% complete
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Log a weight to begin</div>
        )}
      </div>
      <div className="card-surface rounded-2xl p-3">
        <div className="section-header mb-1">Camp Age</div>
        {campAge ? (
          <>
            <div className="display-number text-base">
              {campAge.weeksAhead === 0
                ? "On pace"
                : `${campAge.weeksAhead > 0 ? "+" : ""}${campAge.weeksAhead.toFixed(1)} wks`}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {campAge.weeksAhead >= 0 ? "ahead of schedule" : "behind schedule"}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">—</div>
        )}
      </div>
    </div>
  );
}
