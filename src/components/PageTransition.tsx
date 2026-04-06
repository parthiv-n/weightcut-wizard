import { useRef } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { isNativePlatform } from "@/hooks/useIsNative";

const DURATION = isNativePlatform ? 0.1 : 0.14;

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
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
        mode="popLayout"
        initial={false}
      >
        <motion.div
          key={location.pathname}
          className="page-transition-page"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION, ease: [0.25, 0.1, 0.25, 1] }}
          onAnimationComplete={(definition) => {
            if (isFirstRender.current) {
              isFirstRender.current = false;
            }
            if (definition === "center" || (typeof definition === "object" && (definition as any).opacity === 1)) {
              const main = document.querySelector("main");
              if (main) main.scrollTo(0, 0);
              window.scrollTo(0, 0);
            }
          }}
          style={{ willChange: "opacity" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
