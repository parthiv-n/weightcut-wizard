import { useState, useRef, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const [isEntering, setIsEntering] = useState(true);
  const prevPathRef = useRef(location.pathname);

  useLayoutEffect(() => {
    if (location.pathname !== prevPathRef.current) {
      prevPathRef.current = location.pathname;
      setIsEntering(true);
    }
  }, [location.pathname]);

  const onAnimationEnd = (e: React.AnimationEvent) => {
    if (e.target === e.currentTarget) {
      setIsEntering(false);
    }
  };

  return (
    <div
      className={`page-transition-wrapper ${isEntering ? "page-enter" : ""}`}
      onAnimationEnd={onAnimationEnd}
    >
      {children}
    </div>
  );
}
