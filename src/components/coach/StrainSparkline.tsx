import { memo, useMemo } from "react";

interface Props {
  values: number[]; // length 7, oldest → newest
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Tiny inline 7-day strain sparkline. Pure SVG, no chart deps.
 * - Flat dim line when all-zero / null.
 * - Single-stroke primary path with anchored "today" dot.
 * - Subtle midline for visual reference.
 */
export const StrainSparkline = memo(function StrainSparkline({
  values,
  width = 64,
  height = 24,
  className = "",
}: Props) {
  const safe = useMemo(() => {
    const arr = Array.isArray(values) ? values.slice(0, 7) : [];
    while (arr.length < 7) arr.unshift(0);
    return arr.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  }, [values]);

  const isEmpty = safe.every((v) => v === 0);
  const max = Math.max(...safe, 1);
  const padY = 2;
  const usableH = height - padY * 2;

  const points = useMemo(
    () =>
      safe
        .map((v, i) => {
          const x = (i / 6) * width;
          const y = isEmpty
            ? height / 2
            : height - padY - (v / max) * usableH * 0.85;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" "),
    [safe, isEmpty, max, width, height, usableH]
  );

  const lastX = width;
  const lastY = isEmpty
    ? height / 2
    : height - padY - (safe[6] / max) * usableH * 0.85;

  const total = safe.reduce((s, v) => s + v, 0);
  const trend = useMemo(() => {
    if (isEmpty) return "no training logged this week";
    const first = (safe[0] + safe[1] + safe[2]) / 3;
    const last = (safe[4] + safe[5] + safe[6]) / 3;
    const diff = last - first;
    if (Math.abs(diff) < Math.max(0.4, first * 0.1)) return "trending steady";
    return diff > 0 ? "trending up" : "trending down";
  }, [safe, isEmpty]);

  const ariaLabel = isEmpty
    ? "7-day strain: no training logged this week"
    : `7-day strain: ${total.toFixed(1)} RPE-hours, ${trend}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className={`${isEmpty ? "text-muted-foreground/30" : "text-primary"} ${className}`}
      style={{ transition: "opacity 200ms ease" }}
    >
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="currentColor"
        strokeOpacity={0.08}
        strokeWidth={1}
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "all 300ms ease" }}
      />
      {!isEmpty && (
        <circle cx={lastX} cy={lastY} r={1.6} fill="currentColor" />
      )}
    </svg>
  );
});
