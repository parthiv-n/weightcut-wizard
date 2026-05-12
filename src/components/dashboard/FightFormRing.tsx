import { cn } from "@/lib/utils";

type Props = {
  score: number;
  label: "sharp" | "sharpening" | "off_pace" | "at_risk";
  state: "ok" | "calibrating" | "no_camp" | "paused";
  calibratingDays?: { current: number; needed: number };
  onTap?: () => void;
  size?: number;
};

const LABEL_COPY = {
  sharp: "Sharp",
  sharpening: "Sharpening",
  off_pace: "Off Pace",
  at_risk: "At Risk",
};

const LABEL_STROKE = {
  sharp: "stroke-emerald-500",
  sharpening: "stroke-amber-400",
  off_pace: "stroke-orange-500",
  at_risk: "stroke-rose-500",
};

export function FightFormRing({ score, label, state, calibratingDays, onTap, size = 220 }: Props) {
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress =
    state === "ok"
      ? Math.max(0, Math.min(1, score / 100))
      : state === "calibrating" && calibratingDays
        ? Math.max(0, Math.min(1, calibratingDays.current / calibratingDays.needed))
        : 0;
  const dash = circumference * progress;

  return (
    <button
      type="button"
      onClick={onTap}
      className="relative flex flex-col items-center justify-center"
      aria-label="Open Fight Form Score details"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--muted))"
          strokeWidth={10}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className={cn(
            "transition-all duration-700",
            state === "ok" ? LABEL_STROKE[label] : "stroke-muted-foreground/40",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {state === "ok" && (
          <>
            <span className="display-number text-5xl">{score}</span>
            <span className="section-header mt-1">{LABEL_COPY[label]}</span>
          </>
        )}
        {state === "calibrating" && calibratingDays && (
          <>
            <span className="display-number text-3xl">
              {calibratingDays.current}/{calibratingDays.needed}
            </span>
            <span className="section-header mt-1">Calibrating</span>
          </>
        )}
        {state === "no_camp" && (
          <>
            <span className="section-header">No active camp</span>
            <span className="text-xs text-muted-foreground text-center px-8 mt-2 leading-snug">
              Tap to create one
            </span>
          </>
        )}
        {state === "paused" && (
          <>
            <span className="display-number text-3xl">—</span>
            <span className="section-header mt-1">Paused</span>
          </>
        )}
      </div>
    </button>
  );
}
