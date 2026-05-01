import { useState, useEffect, useRef } from "react";
import { WifiOff, Wifi, Loader2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import {
  getConnectionStatus,
  subscribeConnectionStatus,
  type ConnectionStatus,
} from "@/lib/connectionRecovery";

type BannerMode = "offline" | "reconnecting" | "back-online" | "hidden";

export function OfflineBanner() {
  const { isOffline } = useUser();
  const [recoveryStatus, setRecoveryStatus] = useState<ConnectionStatus>(
    () => getConnectionStatus()
  );
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOfflineRef = useRef(false);

  // Subscribe to connection recovery state (wedge detection / websocket revive).
  useEffect(() => {
    const unsub = subscribeConnectionStatus(setRecoveryStatus);
    return unsub;
  }, []);

  // Track offline → online transition for the brief "Back online" toast.
  useEffect(() => {
    if (isOffline) {
      wasOfflineRef.current = true;
      setShowBackOnline(false);
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowBackOnline(true);
      const timer = setTimeout(() => setShowBackOnline(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOffline]);

  // Resolve the single source of truth for which state to render.
  // Priority: offline > reconnecting > back-online > hidden.
  const mode: BannerMode = isOffline
    ? "offline"
    : recoveryStatus === "recovering"
      ? "reconnecting"
      : showBackOnline
        ? "back-online"
        : "hidden";

  const visible = mode !== "hidden";

  // Keep the element mounted briefly during slide-out so the transition plays.
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [visible]);

  if (!mounted) return null;

  const palette =
    mode === "back-online"
      ? "bg-emerald-600/90 text-white"
      : mode === "reconnecting"
        ? "bg-zinc-900/95 text-zinc-200 border-b border-zinc-700/50"
        : "bg-zinc-900/95 text-zinc-300 border-b border-zinc-700/50";

  return (
    <div
      className={`fixed left-0 right-0 z-[60] flex items-center justify-center gap-2 py-2 text-sm font-medium transition-transform duration-300 ease-out ${
        visible ? "translate-y-0" : "-translate-y-full"
      } ${palette}`}
      style={{ top: "env(safe-area-inset-top, 0px)" }}
      role="status"
      aria-live="polite"
    >
      {mode === "offline" && (
        <>
          <WifiOff className="h-4 w-4" />
          <span>You're offline</span>
        </>
      )}
      {mode === "reconnecting" && (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Reconnecting…</span>
        </>
      )}
      {mode === "back-online" && (
        <>
          <Wifi className="h-4 w-4" />
          <span>Back online</span>
        </>
      )}
    </div>
  );
}
