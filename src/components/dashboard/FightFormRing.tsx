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

// RGB triplets used by the halo + particles so we can vary opacity in CSS
// without re-declaring full color values. Matches the Tailwind palette above.
const LABEL_RGB = {
  sharp: "16, 185, 129",       // emerald-500
  sharpening: "251, 191, 36",  // amber-400
  off_pace: "249, 115, 22",    // orange-500
  at_risk: "244, 63, 94",      // rose-500
};

// Pulse cadence reacts to the label. Sharper form earns a livelier halo;
// At Risk drifts almost-still so the UI doesn't celebrate a bad state.
const HALO_DURATION = {
  sharp: "3.4s",
  sharpening: "5.2s",
  off_pace: "7s",
  at_risk: "9s",
};

// Peak halo intensity at each label — narrower range at At Risk so the
// halo recedes when the score isn't earned.
const HALO_PEAK = {
  sharp: 0.55,
  sharpening: 0.38,
  off_pace: 0.22,
  at_risk: 0.14,
};

// Eight particles is enough to feel alive without becoming noisy on iOS.
const PARTICLE_COUNT = 8;

export function FightFormRing({
  score,
  label,
  state,
  calibratingDays,
  onTap,
  size = 220,
}: Props) {
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress =
    state === "ok"
      ? Math.max(0, Math.min(1, score / 100))
      : state === "calibrating" && calibratingDays
        ? Math.max(0, Math.min(1, calibratingDays.current / calibratingDays.needed))
        : 0;
  const dash = circumference * progress;

  const showHalo = state === "ok";
  // Particles are "earned" — only when the user is actually peaking.
  const showParticles = state === "ok" && score >= 80;
  const showCalibSweep = state === "calibrating";

  const labelRgb = state === "ok" ? LABEL_RGB[label] : "148, 163, 184"; // slate-400 fallback
  const haloDuration = state === "ok" ? HALO_DURATION[label] : "10s";
  const haloPeak = state === "ok" ? HALO_PEAK[label] : 0.1;

  return (
    <button
      type="button"
      onClick={onTap}
      className="relative flex flex-col items-center justify-center"
      aria-label="Open Fight Form Score details"
      style={{ width: size, height: size }}
    >
      {/* Aurora halo. Sits behind everything via z-index. Color, intensity
          and speed are state-reactive via inline CSS vars consumed by the
          ff-ring-halo keyframe in index.css. */}
      {showHalo && (
        <div
          aria-hidden
          className="ff-ring-halo absolute inset-0 rounded-full pointer-events-none"
          style={{
            ["--ff-halo-rgb" as any]: labelRgb,
            ["--ff-halo-peak" as any]: haloPeak,
            animationDuration: haloDuration,
          }}
        />
      )}

      {/* Particles — only when state is "ok" AND score >= 80 (Sharp). Each
          particle gets a different orbit radius and orbit duration so the
          motion doesn't feel mechanical. */}
      {showParticles && (
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
            const orbitRadius = radius - 4 + ((i % 3) - 1) * 10; // -14, -4, +6 px offsets
            const orbitDuration = 12 + (i % 4) * 1.3;             // 12s..16.9s
            const twinkleDuration = 2 + (i % 3) * 0.6;            // 2s..3.2s
            const startOffset = -((orbitDuration * i) / PARTICLE_COUNT);
            return (
              <span
                key={i}
                className="ff-ring-particle"
                style={{
                  ["--ff-halo-rgb" as any]: labelRgb,
                  ["--ff-orbit-r" as any]: `${orbitRadius}px`,
                  animationDuration: `${orbitDuration}s, ${twinkleDuration}s`,
                  animationDelay: `${startOffset}s, ${-(i * 0.4)}s`,
                }}
              />
            );
          })}
        </div>
      )}

      <svg width={size} height={size} className="-rotate-90 relative">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--muted))"
          strokeWidth={10}
          fill="none"
        />
        {/* Score arc */}
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
        {/* Calibrating sweep — a small bright arc sweeping the ring perimeter
            so the user can see data is "scanning in". */}
        {showCalibSweep && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={`rgba(${labelRgb}, 0.75)`}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.08} ${circumference * 0.92}`}
            className="ff-ring-calib-sweep"
            style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}
          />
        )}
      </svg>

      {/* Center content */}
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
