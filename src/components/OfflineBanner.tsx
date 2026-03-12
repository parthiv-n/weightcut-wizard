import { useState, useEffect, useRef } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useUser } from "@/contexts/UserContext";

export function OfflineBanner() {
  const { isOffline } = useUser();
  const [visible, setVisible] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (isOffline) {
      wasOfflineRef.current = true;
      setShowBackOnline(false);
      setVisible(true);
    } else if (wasOfflineRef.current) {
      // Just came back online — show "Back online" briefly
      wasOfflineRef.current = false;
      setShowBackOnline(true);
      const timer = setTimeout(() => {
        setVisible(false);
        // Reset after slide-out animation
        setTimeout(() => setShowBackOnline(false), 300);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOffline]);

  if (!visible && !isOffline) return null;

  return (
    <div
      className={`fixed left-0 right-0 z-[60] flex items-center justify-center gap-2 py-2 text-sm font-medium transition-transform duration-300 ease-out ${
        visible
          ? "translate-y-0"
          : "-translate-y-full"
      } ${
        showBackOnline
          ? "bg-emerald-600/90 text-white"
          : "bg-zinc-900/95 text-zinc-300 border-b border-zinc-700/50"
      }`}
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      {showBackOnline ? (
        <>
          <Wifi className="h-4 w-4" />
          <span>Back online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>You're offline</span>
        </>
      )}
    </div>
  );
}
