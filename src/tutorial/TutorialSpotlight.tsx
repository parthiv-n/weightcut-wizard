import { useEffect, useState, useCallback, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";

interface SpotlightProps {
  targetEl: HTMLElement | null;
}

interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}

const PADDING = 6;
const BORDER_RADIUS = 16; // matches rounded-2xl

function getSpotlightRect(el: HTMLElement): SpotlightRect {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left - PADDING,
    y: rect.top - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
    rx: BORDER_RADIUS,
  };
}

/** Check if an element is position:fixed or position:sticky (like bottom nav items) */
function isFixedOrSticky(el: HTMLElement): boolean {
  let current: HTMLElement | null = el;
  while (current) {
    const pos = getComputedStyle(current).position;
    if (pos === "fixed" || pos === "sticky") return true;
    current = current.parentElement;
  }
  return false;
}

/** Find the nearest scrollable ancestor (for scrollIntoView on the correct container) */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let current = el.parentElement;
  while (current) {
    const { overflow, overflowY } = getComputedStyle(current);
    if (/(auto|scroll)/.test(overflow + overflowY)) return current;
    current = current.parentElement;
  }
  return null;
}

export function TutorialSpotlight({ targetEl }: SpotlightProps) {
  const prefersReduced = useReducedMotion();
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const updateRect = useCallback(() => {
    if (!targetEl) {
      setRect(null);
      return;
    }
    setRect(getSpotlightRect(targetEl));
  }, [targetEl]);

  // Scroll target into view (skip for fixed elements like bottom nav) and measure
  useEffect(() => {
    if (!targetEl) {
      setRect(null);
      return;
    }

    // Fixed elements (bottom nav) are always visible — just measure directly
    if (isFixedOrSticky(targetEl)) {
      updateRect();
      return;
    }

    // Scroll into view within the correct scrollable container
    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

    // Wait for scroll to settle before measuring
    const t = setTimeout(updateRect, 350);
    return () => clearTimeout(t);
  }, [targetEl, updateRect]);

  // ResizeObserver + scroll/resize listeners for layout shifts
  useEffect(() => {
    if (!targetEl) return;

    observerRef.current = new ResizeObserver(updateRect);
    observerRef.current.observe(targetEl);

    // Listen on the scroll parent (the actual scrollable content area), not just window
    const scrollParent = findScrollParent(targetEl);
    scrollParent?.addEventListener("scroll", updateRect, { passive: true });
    window.addEventListener("scroll", updateRect, { passive: true });
    window.addEventListener("resize", updateRect, { passive: true });

    // Also listen for visual viewport changes on iOS (keyboard, URL bar)
    window.visualViewport?.addEventListener("resize", updateRect);
    window.visualViewport?.addEventListener("scroll", updateRect);

    return () => {
      observerRef.current?.disconnect();
      scrollParent?.removeEventListener("scroll", updateRect);
      window.removeEventListener("scroll", updateRect);
      window.removeEventListener("resize", updateRect);
      window.visualViewport?.removeEventListener("resize", updateRect);
      window.visualViewport?.removeEventListener("scroll", updateRect);
    };
  }, [targetEl, updateRect]);

  // No target = no spotlight overlay at all — page stays fully visible
  if (!targetEl || !rect) return null;

  const animationProps = prefersReduced
    ? { duration: 0 }
    : { duration: 0.35, ease: [0.32, 0.72, 0, 1] as const };

  return (
    <svg
      className="fixed inset-0"
      style={{
        width: "100vw",
        height: "100dvh",
        pointerEvents: "auto",
      }}
      aria-hidden="true"
    >
      <defs>
        <mask id="tutorial-spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <motion.rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            rx={rect.rx}
            fill="black"
            initial={false}
            animate={{
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            }}
            transition={animationProps}
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.6)"
        mask="url(#tutorial-spotlight-mask)"
      />
    </svg>
  );
}
