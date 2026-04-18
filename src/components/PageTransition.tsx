import { useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { isNativePlatform } from "@/hooks/useIsNative";

const DURATION = isNativePlatform ? 0.08 : 0.12;

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname;
      const main = document.querySelector("main");
      if (main) main.scrollTo(0, 0);
      window.scrollTo(0, 0);
    }
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
        mode="popLayout"
        initial={false}
      >
        <motion.div
          key={location.pathname}
          className="page-transition-page"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: DURATION,
            ease: [0.22, 1, 0.36, 1],
            exit: { duration: 0 },
          }}
          style={{ willChange: "opacity, transform" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
