import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useGlobalLoading } from "@/lib/globalLoading";

/**
 * Mounted once at the App root, OUTSIDE every Suspense / route subtree.
 * Survives navigate() calls so a mutation overlay can persist across the
 * route boundary into the destination page's first paint.
 */
export function GlobalLoadingOverlay() {
  const { visible, title, subtitle, startedAt } = useGlobalLoading();
  const [stillWorking, setStillWorking] = useState(false);

  useEffect(() => {
    if (!visible) { setStillWorking(false); return; }
    const t = setTimeout(() => setStillWorking(true), 1000);
    return () => clearTimeout(t);
  }, [visible, startedAt]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-background/85 backdrop-blur-md flex flex-col items-center justify-center gap-4 pointer-events-auto"
      style={{ zIndex: 10000, opacity: 1 }}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <div className="text-center px-6 max-w-[320px]">
        <p className="text-[15px] font-semibold">{title}</p>
        {(subtitle || stillWorking) && (
          <p className="text-[12px] text-muted-foreground mt-1">
            {stillWorking ? "Still working…" : subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
