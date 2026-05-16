import { ImpactStyle } from "@capacitor/haptics";
import { triggerHaptic } from "@/lib/haptics";

export const DISCIPLINES = [
  "All",
  "BJJ",
  "Boxing",
  "Muay Thai",
  "Wrestling",
  "Sparring",
  "Strength",
] as const;
export type DisciplineFilter = (typeof DISCIPLINES)[number];

export function DisciplineFilterTabs({
  value,
  onChange,
}: {
  value: DisciplineFilter;
  onChange: (next: DisciplineFilter) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
      {DISCIPLINES.map((d) => {
        const active = value === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => {
              if (d !== value) {
                void triggerHaptic(ImpactStyle.Light);
                onChange(d);
              }
            }}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
              active
                ? "bg-primary text-primary-foreground"
                : "bg-card/40 text-muted-foreground hover:bg-card/70"
            }`}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}
