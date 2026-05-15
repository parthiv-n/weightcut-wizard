/**
 * SwipeDial — horizontal scroll-snap picker that replaces multi-row chip
 * grids with a single-line "wheel" selector. The active option sits in
 * a fixed center frame; the user swipes horizontally to bring a different
 * option into the frame, or taps any option to scroll it to center.
 *
 * Why this shape:
 *  - Eats one line of vertical space regardless of option count.
 *  - Reads as a familiar iOS-style picker (haptic feedback on settle).
 *  - Multi-select chip grids took 2-3 rows for things like sports/goal/
 *    experience and dominated the Goals page above the fold.
 *
 * Implementation notes:
 *  - Uses native CSS `scroll-snap-x mandatory` so momentum scrolling on
 *    iOS Safari snaps cleanly without a JS animation loop.
 *  - The active index is derived from the container's `scrollLeft` after
 *    a 90 ms settle — debounced to avoid firing onChange while the user
 *    is mid-flick. The settle threshold is empirical; shorter values
 *    triggered onChange before the snap finished on slower phones.
 *  - The center frame is an absolute overlay (pointer-events-none) so
 *    taps still hit the underlying option button.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { triggerHapticSelection } from "@/lib/haptics";

export interface SwipeDialOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: SwipeDialOption[];
  onChange: (value: string) => void;
  /** Visual width of each option cell, in px. 110 reads well at default
   *  font-size; tweak if labels truncate. */
  cellWidth?: number;
  className?: string;
  ariaLabel?: string;
}

const SETTLE_MS = 90;

export function SwipeDial({
  value,
  options,
  onChange,
  cellWidth = 110,
  className = "",
  ariaLabel,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedRef = useRef<string>(value);

  // Preserve the original index for fast scrollTo math + active highlighting
  // without re-running .findIndex on every scroll tick.
  const activeIndex = useMemo(
    () => Math.max(0, options.findIndex((o) => o.value === value)),
    [options, value],
  );

  // Sync external value -> scroll position when value changes from outside.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = activeIndex * cellWidth;
    if (Math.abs(el.scrollLeft - target) > 1) {
      el.scrollTo({ left: target, behavior: "auto" });
      lastEmittedRef.current = value;
    }
  }, [activeIndex, cellWidth, value]);

  const handleScroll = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollLeft / cellWidth);
      const clamped = Math.max(0, Math.min(options.length - 1, idx));
      const nextValue = options[clamped]?.value;
      if (nextValue && nextValue !== lastEmittedRef.current) {
        lastEmittedRef.current = nextValue;
        triggerHapticSelection();
        onChange(nextValue);
      }
    }, SETTLE_MS);
  }, [cellWidth, onChange, options]);

  const scrollToIndex = useCallback(
    (idx: number) => {
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollTo({ left: idx * cellWidth, behavior: "smooth" });
    },
    [cellWidth],
  );

  // The empty-padding spacers ensure the first and last real options can
  // reach the centered "active" slot. We compute the spacer width from the
  // container's measured width on mount + on resize.
  const padderRef = useRef<{ left: HTMLDivElement | null; right: HTMLDivElement | null }>({
    left: null,
    right: null,
  });
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const sync = () => {
      const padding = (el.clientWidth - cellWidth) / 2;
      const safe = Math.max(0, padding);
      if (padderRef.current.left) padderRef.current.left.style.width = `${safe}px`;
      if (padderRef.current.right) padderRef.current.right.style.width = `${safe}px`;
      // Re-anchor scrollLeft so the active item stays centered after a
      // resize (e.g. orientation change, dynamic viewport on iOS).
      el.scrollTo({ left: activeIndex * cellWidth, behavior: "auto" });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeIndex, cellWidth]);

  return (
    <div className={`relative ${className}`}>
      {/* Center "selection" frame. Pointer-events-none so taps fall through. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-primary/10 ring-1 ring-primary/40"
        style={{ width: cellWidth - 8, height: 40 }}
      />

      <div
        ref={scrollerRef}
        role="listbox"
        aria-label={ariaLabel}
        onScroll={handleScroll}
        className="flex items-center overflow-x-auto overflow-y-hidden scrollbar-hide snap-x snap-mandatory h-12 rounded-2xl bg-muted/20"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        <div ref={(el) => { padderRef.current.left = el; }} className="shrink-0" />
        {options.map((opt, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => scrollToIndex(i)}
              className="snap-center shrink-0 h-12 flex items-center justify-center"
              style={{ width: cellWidth }}
            >
              <span
                className={`text-[14px] truncate px-2 transition-all ${
                  active
                    ? "font-semibold text-foreground scale-100"
                    : "font-medium text-muted-foreground/60 scale-95"
                }`}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
        <div ref={(el) => { padderRef.current.right = el; }} className="shrink-0" />
      </div>
    </div>
  );
}
