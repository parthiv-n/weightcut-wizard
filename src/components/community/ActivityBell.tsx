import { Bell } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";

interface ActivityBellProps {
  gymId: Id<"gyms"> | null;
  onClick: () => void;
}

export function ActivityBell({ gymId, onClick }: ActivityBellProps) {
  const count = useQuery(
    api.feedActivity.unreadActivityCount,
    gymId ? { gymId } : "skip",
  );
  const unread = (count ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic(ImpactStyle.Light);
        onClick();
      }}
      aria-label="Activity"
      className="glass-card relative shrink-0 h-9 w-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
    >
      <Bell className="h-4 w-4" strokeWidth={2.2} />
      {unread && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
          aria-label={`${count} unread`}
        >
          {(count ?? 0) > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
