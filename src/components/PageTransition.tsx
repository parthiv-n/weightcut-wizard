import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useNavigationDirection } from "@/hooks/useNavigationDirection";
import { isNativePlatform } from "@/hooks/useIsNative";

const DURATION = isNativePlatform ? 0.15 : 0.2;

const variants = isNativePlatform
  ? {
      enter: () => ({ opacity: 0 }),
      center: { opacity: 1 },
      exit: () => ({ opacity: 0 }),
    }
  : {
      enter: (direction: "forward" | "back") => ({
        opacity: 0,
        x: direction === "forward" ? 40 : -40,
      }),
      center: {
        opacity: 1,
        x: 0,
      },
      exit: (direction: "forward" | "back") => ({
        opacity: 0,
        x: direction === "forward" ? -40 : 40,
      }),
    };

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const direction = useNavigationDirection();
  const prefersReducedMotion = useReducedMotion();
  const isFirstRender = useRef(true);

  useEffect(() => {
    const main = document.querySelector("main");
    if (main) main.scrollTo(0, 0);
  }, [location.pathname]);

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
        mode="wait"
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
          transition={{ duration: DURATION, ease: [0.25, 0.1, 0.25, 1] }}
          onAnimationComplete={() => {
            if (isFirstRender.current) {
              isFirstRender.current = false;
            }
          }}
          style={{ willChange: "transform, opacity" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
