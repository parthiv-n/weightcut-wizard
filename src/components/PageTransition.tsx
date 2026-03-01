import { useRef } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useNavigationDirection } from "@/hooks/useNavigationDirection";

const DURATION = 0.35;
const EASING: [number, number, number, number] = [0.32, 0.72, 0, 1];

// Forward (push): new page slides in from right ON TOP, old page fades out underneath
// Back (pop): current page slides out to right ON TOP, previous page fades in underneath
const variants = {
  enter: (direction: "forward" | "back") => ({
    x: direction === "forward" ? "100%" : "0%",
    opacity: direction === "forward" ? 1 : 0,
    zIndex: direction === "forward" ? 2 : 1,
    position: "absolute" as const,
  }),
  center: {
    x: "0%",
    opacity: 1,
    zIndex: 2,
    position: "relative" as const,
  },
  exit: (direction: "forward" | "back") => ({
    x: direction === "forward" ? "0%" : "100%",
    opacity: direction === "forward" ? 0 : 1,
    zIndex: direction === "forward" ? 1 : 2,
    position: "absolute" as const,
  }),
};

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const direction = useNavigationDirection();
  const prefersReducedMotion = useReducedMotion();

  // Track whether this is the very first render (skip animation)
  const isFirstRender = useRef(true);

  if (prefersReducedMotion) {
    return (
      <div className="page-transition-container">
        <div className="page-transition-page">{children}</div>
      </div>
    );
  }

  return (
    <div className="page-transition-container">
      <AnimatePresence
        mode="sync"
        initial={false}
        custom={direction}
      >
        <motion.div
          key={location.pathname}
          className="page-transition-page"
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            duration: DURATION,
            ease: EASING,
            opacity: { duration: DURATION * 0.6, ease: "easeOut" },
          }}
          onAnimationComplete={() => {
            if (isFirstRender.current) {
              isFirstRender.current = false;
            }
          }}
          style={{ width: "100%", top: 0, left: 0, willChange: "transform, opacity" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
