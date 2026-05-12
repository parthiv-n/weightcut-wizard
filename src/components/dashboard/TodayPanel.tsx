import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";

type Adherence = {
  weight: boolean;
  training: boolean;
  sleep: boolean;
  wellnessCheckin: boolean;
};

type Props = {
  adherence: Adherence;
  nextWorkout?: { title: string; timeLabel: string; href: string } | null;
};

const ITEMS: Array<{ key: keyof Adherence; label: string; href: string }> = [
  { key: "weight", label: "Weight", href: "/weight" },
  { key: "training", label: "Training", href: "/training" },
  { key: "sleep", label: "Sleep", href: "/sleep" },
  { key: "wellnessCheckin", label: "Check-in", href: "/wellness" },
];

export function TodayPanel({ adherence, nextWorkout }: Props) {
  const allDone = ITEMS.every((i) => adherence[i.key]);
  return (
    <div className="card-surface rounded-2xl p-3">
      <div className="flex items-center justify-between">
        <div className="section-header">Today</div>
        {allDone && <span className="text-xs text-emerald-400">All set</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {ITEMS.map((it) => (
          <Link
            key={it.key}
            to={it.href}
            className="flex items-center gap-2 rounded-lg py-1.5 px-2 hover:bg-muted/40 transition"
          >
            {adherence[it.key] ? (
              <CheckCircle2 className="size-4 text-emerald-400" />
            ) : (
              <Circle className="size-4 text-muted-foreground" />
            )}
            <span className="text-sm">{it.label}</span>
          </Link>
        ))}
      </div>
      {nextWorkout && (
        <Link
          to={nextWorkout.href}
          className="flex items-center justify-between mt-3 pt-3 border-t border-border/50"
        >
          <div>
            <div className="text-xs text-muted-foreground">Next</div>
            <div className="text-sm">{nextWorkout.title} · {nextWorkout.timeLabel}</div>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      )}
    </div>
  );
}
