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

export function MacroPieChart({
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
    const remaining = Math.max(0, calorieTarget - calories);
    const isOver = calories > calorieTarget;
    const calPct = calorieTarget > 0 ? Math.min((calories / calorieTarget) * 100, 100) : 0;

    // Circular progress for calories
    const RADIUS = 52;
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
    const strokeDashoffset = CIRCUMFERENCE - (calPct / 100) * CIRCUMFERENCE;

    // Macro bar helper
    const MacroRow = ({
        label,
        value,
        goal,
        color,
        bgColor,
    }: {
        label: string;
        value: number;
        goal: number;
        color: string;
        bgColor: string;
    }) => {
        const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
        const left = Math.max(0, goal - value);
        const isReached = value >= goal && goal > 0;

        return (
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-xs font-semibold text-foreground/80">{label}</span>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                        <span className="font-semibold text-foreground">{Math.round(value)}</span>
                        <span className="text-muted-foreground/60"> / {Math.round(goal)}g</span>
                    </span>
                </div>
                <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: bgColor }}>
                    <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                        style={{
                            width: `${pct}%`,
                            background: isReached
                                ? `linear-gradient(90deg, ${color}, ${color}dd)`
                                : `linear-gradient(90deg, ${color}cc, ${color})`,
                            boxShadow: pct > 5 ? `0 0 8px ${color}40` : 'none',
                        }}
                    />
                </div>
                <p className="text-[10px] tabular-nums text-muted-foreground/50">
                    {isReached ? "✓ Goal reached" : `${Math.round(left)}g left`}
                </p>
            </div>
        );
    };

    return (
        <div className="nutrition-dashboard">
            {/* Top section: Ring + Stats */}
            <div className="flex items-center gap-5">
                {/* Circular calorie ring */}
                <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
                    <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                        {/* Background track */}
                        <circle
                            cx="60" cy="60" r={RADIUS}
                            fill="none"
                            stroke="hsl(var(--border) / 0.2)"
                            strokeWidth="8"
                        />
                        {/* Progress arc */}
                        <circle
                            cx="60" cy="60" r={RADIUS}
                            fill="none"
                            stroke={isOver ? "hsl(var(--destructive))" : "url(#calGradient)"}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={CIRCUMFERENCE}
                            strokeDashoffset={strokeDashoffset}
                            className="transition-all duration-700 ease-out"
                            style={{ filter: `drop-shadow(0 0 6px ${isOver ? 'hsl(var(--destructive) / 0.4)' : 'hsl(var(--primary) / 0.3)'})` }}
                        />
                        <defs>
                            <linearGradient id="calGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="hsl(var(--primary))" />
                                <stop offset="100%" stopColor="hsl(var(--secondary))" />
                            </linearGradient>
                        </defs>
                    </svg>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold tabular-nums leading-none tracking-tight">
                            {Math.round(calories)}
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60 mt-1 font-medium">
                            kcal
                        </span>
                    </div>
                </div>

                {/* Right side: Goal / Food / Remaining */}
                <div className="flex-1 min-w-0 space-y-3">
                    <div className="grid grid-cols-3 gap-1">
                        {[
                            { label: "Goal", value: Math.round(calorieTarget), color: "text-foreground" },
                            { label: "Eaten", value: Math.round(calories), color: "text-primary" },
                            { label: isOver ? "Over" : "Left", value: isOver ? Math.round(calories - calorieTarget) : Math.round(remaining), color: isOver ? "text-destructive" : "text-emerald-500" },
                        ].map((stat) => (
                            <div key={stat.label} className="text-center">
                                <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60 font-medium">{stat.label}</p>
                                <p className={`text-base font-bold tabular-nums leading-snug ${stat.color}`}>{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Linear calorie progress below stats */}
                    <div className="space-y-1">
                        <div className="relative h-1.5 rounded-full overflow-hidden bg-border/20">
                            <div
                                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                                style={{
                                    width: `${calPct}%`,
                                    background: isOver
                                        ? 'hsl(var(--destructive))'
                                        : 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)))',
                                    boxShadow: calPct > 5 ? `0 0 8px hsl(var(--primary) / 0.3)` : 'none',
                                }}
                            />
                        </div>
                        <p className="text-[9px] text-muted-foreground/40 tabular-nums text-right">
                            {Math.round(calPct)}% of daily goal
                        </p>
                    </div>
                </div>
            </div>

            {/* Macro progress bars */}
            <div className="mt-5 pt-4 border-t border-border/20 space-y-3">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-muted-foreground/60">Macros</span>
                    {onEditTargets && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEditTargets(); }}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors"
                        >
                            <Settings className="h-3 w-3" />
                            Edit targets
                        </button>
                    )}
                </div>
                <MacroRow
                    label="Protein"
                    value={protein}
                    goal={proteinGoal || 0}
                    color="#3b82f6"
                    bgColor="rgba(59, 130, 246, 0.08)"
                />
                <MacroRow
                    label="Carbs"
                    value={carbs}
                    goal={carbsGoal || 0}
                    color="#f97316"
                    bgColor="rgba(249, 115, 22, 0.08)"
                />
                <MacroRow
                    label="Fat"
                    value={fats}
                    goal={fatsGoal || 0}
                    color="#a855f7"
                    bgColor="rgba(168, 85, 247, 0.08)"
                />
            </div>
        </div>
    );
}
