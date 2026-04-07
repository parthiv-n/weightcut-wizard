import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { triggerHapticSelection, celebrateSuccess } from "@/lib/haptics";
import { useAITask } from "@/contexts/AITaskContext";
import type { AITask } from "@/contexts/AITaskContext";

const ACTIVE_SESSION_KEY = "wcw_active_gym_session";
const PILL_HEIGHT = 40;
const PILL_GAP = 8;

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const tick = () => {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setElapsed(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return <>{elapsed}</>;
}

function IndicatorPill({
  task,
  index,
  gymActive,
  onTap,
}: {
  task: AITask;
  index: number;
  gymActive: boolean;
  onTap: (task: AITask) => void;
}) {
  const statusConfig = {
    running: {
      bg: "bg-primary shadow-primary/30",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      right: <ElapsedTimer startedAt={task.startedAt} />,
    },
    done: {
      bg: "bg-green-500 shadow-green-500/30",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      right: "Ready",
    },
    error: {
      bg: "bg-red-500 shadow-red-500/30",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      right: "Failed",
    },
  }[task.status];

  const bottomOffset = 5.5 * 16 + index * (PILL_HEIGHT + PILL_GAP); // 5.5rem base + stacking

  return (
    <button
      onClick={() => onTap(task)}
      className={`fixed z-[9997] flex items-center gap-2 px-3 py-2 rounded-full text-white shadow-lg active:scale-95 transition-all md:hidden ${statusConfig.bg}`}
      style={{
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`,
        left: gymActive ? undefined : "1rem",
        right: gymActive ? "1rem" : undefined,
        height: `${PILL_HEIGHT}px`,
      }}
    >
      {statusConfig.icon}
      <span className="text-[11px] font-semibold truncate max-w-[100px]">{task.label}</span>
      <span className="text-[10px] font-bold tabular-nums opacity-80">{statusConfig.right}</span>
    </button>
  );
}

export function AIFloatingIndicator() {
  const { tasks, dismissTask } = useAITask();
  const [gymActive, setGymActive] = useState(false);
  const celebratedRef = useRef<Set<string>>(new Set());
  const navigate = useNavigate();
  const location = useLocation();

  // Poll localStorage for gym session (to offset position)
  useEffect(() => {
    const check = () => setGymActive(!!localStorage.getItem(ACTIVE_SESSION_KEY));
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  // Fire haptic on completion for each task
  useEffect(() => {
    tasks.forEach((t) => {
      if (t.status === "done" && !celebratedRef.current.has(t.id)) {
        celebratedRef.current.add(t.id);
        celebrateSuccess();
      }
    });
  }, [tasks]);

  // Show all tasks not on their own page
  const visible = tasks.filter((t) => location.pathname !== t.returnPath);

  if (visible.length === 0) return null;

  const handleTap = (task: AITask) => {
    triggerHapticSelection();
    navigate(task.returnPath);
    if (task.status === "done" || task.status === "error") {
      dismissTask(task.id);
    }
  };

  return (
    <>
      {visible.map((task, i) => (
        <IndicatorPill
          key={task.id}
          task={task}
          index={i}
          gymActive={gymActive}
          onTap={handleTap}
        />
      ))}
    </>
  );
}
