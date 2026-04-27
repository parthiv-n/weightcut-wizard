import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Bell, ChevronRight } from "lucide-react";
import { useMyGyms } from "@/hooks/coach/useMyGyms";
import { useGymAnnouncements } from "@/hooks/coach/useGymAnnouncements";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";

interface Props {
  userId: string | null;
}

const DISMISSED_KEY = "wcw_announcement_alerts_dismissed";

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    /* ignore quota errors */
  }
}

function todayKey(): string {
  return `wcw_announcement_alert_seen_${new Date().toISOString().slice(0, 10)}`;
}

export default function NewAnnouncementWidget({ userId }: Props) {
  const navigate = useNavigate();
  const { gyms } = useMyGyms(userId);
  const gymIds = useMemo(() => gyms.map((g) => g.gym_id), [gyms]);
  const { announcements } = useGymAnnouncements(userId, gymIds);

  const [sessionDismissed, setSessionDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(todayKey()) === "1"; } catch { return false; }
  });
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => readDismissed());

  // Re-read dismissed list on focus so cross-tab dismissal stays in sync.
  useEffect(() => {
    const onFocus = () => setDismissedIds(readDismissed());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const visible = useMemo(
    () => announcements.filter((a) => !dismissedIds.includes(a.id)),
    [announcements, dismissedIds]
  );
  const count = visible.length;
  const latest = visible[0];
  const show = !sessionDismissed && count > 0 && !!latest;

  const handleTap = useCallback(() => {
    const ids = visible.map((a) => a.id);
    writeDismissed([...dismissedIds, ...ids]);
    try { sessionStorage.setItem(todayKey(), "1"); } catch { /* ignore */ }
    setSessionDismissed(true);
    triggerHaptic(ImpactStyle.Light);
    navigate("/my-gym");
  }, [visible, dismissedIds, navigate]);

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.button
          key="new-announcement-widget"
          type="button"
          onClick={handleTap}
          aria-label="View new announcements"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="w-full card-surface rounded-2xl border border-border p-3 flex items-center gap-3 active:scale-[0.99] transition-all"
        >
          <span className="relative flex h-9 w-9 rounded-full bg-primary/10 items-center justify-center flex-shrink-0">
            <Bell className="h-4 w-4 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center tabular-nums">
              {count > 9 ? "9+" : count}
            </span>
          </span>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[12px] font-semibold">
              {count === 1 ? "New announcement" : `${count} new announcements`}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {latest.sender_name} · {latest.gym_name}
            </p>
          </div>
          <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
