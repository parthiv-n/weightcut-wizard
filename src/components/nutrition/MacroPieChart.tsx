import { memo, type ReactNode } from "react";
import { Settings } from "lucide-react";

interface MacroPieChartProps {
    calories: number;
    calorieTarget: number;
    protein: number;
    carbs: number;
    fats: number;
    proteinGoal?: number;
    carbsGoal?: number;
    fatsGoal?: number;
    onEditTargets?: () => void;
}

interface RingProps {
    pct: number;
    color: string;
    trackOpacity?: number;
    size: number;
    strokeWidth: number;
    children: ReactNode;
    glow?: boolean;
}

const Ring = ({ pct, color, size, strokeWidth, children, trackOpacity = 0.18, glow = true }: RingProps) => {
    const r = (size - strokeWidth) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.min(Math.max(pct, 0), 100);
    const offset = c - (clamped / 100) * c;
    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke={`hsl(var(--border) / ${trackOpacity})`} strokeWidth={strokeWidth} />
                <circle cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke={color} strokeWidth={strokeWidth}
                    strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
                    className="transition-all duration-700 ease-out"
                    style={glow ? { filter: `drop-shadow(0 0 5px ${color}55)` } : undefined} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                {children}
            </div>
        </div>
    );
};

interface MacroCardProps {
    label: string;
    value: number;
    goal: number;
    color: string;
}

const MacroCard = ({ label, value, goal, color }: MacroCardProps) => {
    const pct = goal > 0 ? (value / goal) * 100 : 0;
    const left = Math.max(0, goal - value);
    return (
        <div className="card-surface rounded-3xl px-3 py-4 flex flex-col items-center gap-2">
            <Ring pct={pct} color={color} size={64} strokeWidth={8}>
                <span className="text-[15px] font-bold tabular-nums" style={{ color }}>
                    {Math.round(value)}
                    <span className="text-[10px] font-semibold ml-0.5" style={{ color }}>g</span>
                </span>
            </Ring>
            <div className="text-center">
                <p className="text-[12px] font-semibold text-foreground leading-none">{label}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground/60 mt-1">
                    {goal > 0 ? `${Math.round(left)}g left` : "—"}
                </p>
            </div>
        </div>
    );
};

export const MacroPieChart = memo(function MacroPieChart({
    calories,
    calorieTarget,
    protein,
    carbs,
    fats,
    proteinGoal,
    carbsGoal,
    fatsGoal,
    onEditTargets,
}: MacroPieChartProps) {
    const isOver = calories > calorieTarget;
    const calPct = calorieTarget > 0 ? (calories / calorieTarget) * 100 : 0;
    const calColor = isOver ? "hsl(var(--destructive))" : "hsl(var(--primary))";

    return (
        <div className="space-y-5">
            {/* Calorie card — wide rectangle, big kcal number on left, ring on right */}
            <div className="card-surface rounded-3xl px-6 py-5 flex items-center gap-5">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-muted-foreground/60">
                            Calories
                        </p>
                        {onEditTargets && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onEditTargets(); }}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors"
                            >
                                <Settings className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                    <p className="text-[36px] font-bold tabular-nums leading-none tracking-tight mt-2 text-foreground">
                        {Math.round(calories)}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60 mt-2 tabular-nums font-medium">
                        kcal today
                    </p>
                </div>
                <Ring pct={calPct} color={calColor} size={88} strokeWidth={10}>
                    <span className="text-[18px] font-bold tabular-nums tracking-tight" style={{ color: calColor }}>
                        {Math.round(Math.min(calPct, 999))}%
                    </span>
                </Ring>
            </div>

            {/* Macro grid — 3 cards, each with its own ring; backgrounds neutral, only numbers tinted */}
            <div className="grid grid-cols-3 gap-3">
                <MacroCard label="Protein" value={protein} goal={proteinGoal ?? 0} color="#3b82f6" />
                <MacroCard label="Carbs" value={carbs} goal={carbsGoal ?? 0} color="#f97316" />
                <MacroCard label="Fat" value={fats} goal={fatsGoal ?? 0} color="#a855f7" />
            </div>
        </div>
    );
});
