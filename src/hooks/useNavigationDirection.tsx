import { createContext, useContext, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";

type Direction = "forward" | "back";

const NavigationDirectionContext = createContext<Direction>("forward");

export function useNavigationDirection() {
  return useContext(NavigationDirectionContext);
}

export function NavigationDirectionProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const directionRef = useRef<Direction>("forward");
  const pendingPopRef = useRef(false);

  // Listen for browser back/forward — fires before React re-renders
  useEffect(() => {
    const onPopState = () => {
      pendingPopRef.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // On each navigation, read the pending flag and set direction
  useLayoutEffect(() => {
    if (pendingPopRef.current) {
      directionRef.current = "back";
      pendingPopRef.current = false;
    } else {
      directionRef.current = "forward";
    }
  }, [location.pathname]);

  return (
    <NavigationDirectionContext.Provider value={directionRef.current}>
      {children}
    </NavigationDirectionContext.Provider>
  );
}
