import { motion } from "motion/react";
import { springs } from "@/lib/motion";
import { Trophy } from "lucide-react";
import type { PRType } from "@/pages/gym/types";

interface PRBadgeProps {
  type: PRType;
  isNew?: boolean;
}

const PR_LABELS: Record<PRType, string> = {
  weight: "Weight PR",
  reps: "Rep PR",
  volume: "Volume PR",
  "1rm": "1RM PR",
};

export function PRBadge({ type, isNew }: PRBadgeProps) {
  return (
    <motion.span
      initial={isNew ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={springs.bouncy}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
        isNew
          ? "bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/30 shadow-[0_0_8px_rgba(234,179,8,0.2)]"
          : "bg-yellow-500/10 text-yellow-500/80"
      }`}
    >
      <Trophy className="h-3 w-3" />
      {PR_LABELS[type]}
    </motion.span>
  );
}
