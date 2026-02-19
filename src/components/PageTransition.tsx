import { useState, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const [stage, setStage] = useState<"enter" | "exit">("enter");
  const [displayLocation, setDisplayLocation] = useState(location);

  useLayoutEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setStage("exit");
    }
  }, [location.pathname]);

  const onAnimationEnd = () => {
    if (stage === "exit") {
      setDisplayLocation(location);
      setStage("enter");
    }
  };

  return (
    <div
      key={displayLocation.pathname}
      className={`page-transition-wrapper page-${stage}`}
      onAnimationEnd={onAnimationEnd}
    >
      {children}
    </div>
  );
}
