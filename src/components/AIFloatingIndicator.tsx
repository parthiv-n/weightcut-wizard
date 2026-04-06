import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { triggerHapticSelection, celebrateSuccess } from "@/lib/haptics";
import { useAITask } from "@/contexts/AITaskContext";

const ACTIVE_SESSION_KEY = "wcw_active_gym_session";

export function AIFloatingIndicator() {
  const { tasks, dismissTask } = useAITask();
  const [elapsed, setElapsed] = useState("");
  const [celebrated, setCelebrated] = useState<string | null>(null);
  const [gymActive, setGymActive] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Pick the first non-dismissed task by priority: running > done > error
  const task =
    tasks.find((t) => t.status === "running") ??
    tasks.find((t) => t.status === "done") ??
    tasks.find((t) => t.status === "error") ??
    null;

  // Poll localStorage for gym session (to offset position)
  useEffect(() => {
    const check = () => setGymActive(!!localStorage.getItem(ACTIVE_SESSION_KEY));
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  // Update elapsed time
  useEffect(() => {
    if (!task?.startedAt) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - task.startedAt) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setElapsed(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [task?.startedAt]);

  // Fire haptic on completion
  useEffect(() => {
    if (task?.status === "done" && celebrated !== task.id) {
      celebrateSuccess();
      setCelebrated(task.id);
    }
  }, [task?.status, task?.id, celebrated]);

  if (!task || location.pathname === task.returnPath) return null;

  const handleTap = () => {
    triggerHapticSelection();
    navigate(task.returnPath);
    if (task.status === "done" || task.status === "error") {
      dismissTask(task.id);
    }
  };

  const statusConfig = {
    running: {
      bg: "bg-primary shadow-primary/30",
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      label: elapsed,
    },
    done: {
      bg: "bg-green-500 shadow-green-500/30",
      icon: <CheckCircle2 className="h-4 w-4" />,
      label: "Ready!",
    },
    error: {
      bg: "bg-red-500 shadow-red-500/30",
      icon: <AlertCircle className="h-4 w-4" />,
      label: "Failed",
    },
  }[task.status];

  return (
    <button
      onClick={handleTap}
      className={`fixed z-[9997] flex items-center gap-2 px-3.5 py-2 rounded-full text-white shadow-lg active:scale-95 transition-all md:hidden ${statusConfig.bg}`}
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)",
        left: gymActive ? undefined : "1rem",
        right: gymActive ? "1rem" : undefined,
      }}
    >
      {statusConfig.icon}
      <span className="text-xs font-bold tabular-nums">{statusConfig.label}</span>
    </button>
  );
}
