import type { MedalTier } from "./types";

const TIER_HSL: Record<MedalTier, string> = {
  gold: "hsl(var(--medal-gold))",
  silver: "hsl(var(--medal-silver))",
  bronze: "hsl(var(--medal-bronze))",
};

export function MedalIcon({
  tier,
  size = 20,
}: {
  tier: MedalTier;
  size?: number;
}) {
  const color = TIER_HSL[tier];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="14" r="6" fill={color} opacity="0.9" />
      <circle
        cx="12"
        cy="14"
        r="6"
        stroke={color}
        strokeOpacity="0.6"
        strokeWidth="1"
      />
      <path
        d="M8 2 L10 8 L14 8 L16 2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
