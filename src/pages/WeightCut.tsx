import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { triggerHapticSelection } from "@/lib/haptics";
import FightWeek from "./FightWeek";
import Hydration from "./Hydration";

const tabs = [
  { key: "plan" as const, label: "Fight Plan" },
  { key: "rehydration" as const, label: "Rehydration" },
];

export default function WeightCut() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "rehydration" ? "rehydration" : "plan";
  const [tab, setTab] = useState<"plan" | "rehydration">(initialTab);

  const switchTab = (t: "plan" | "rehydration") => {
    setTab(t);
    triggerHapticSelection();
    setSearchParams(t === "plan" ? {} : { tab: t }, { replace: true });
  };

  return (
    <div className="animate-page-in p-3 sm:p-5 md:p-6 max-w-7xl mx-auto space-y-3 pb-20 md:pb-6">
      {/* Segmented control */}
      <div className="flex rounded-full bg-muted p-0.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex-1 text-sm font-semibold py-2 rounded-full transition-colors duration-150 ${
              tab === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "plan" ? <FightWeek /> : <Hydration />}
    </div>
  );
}
