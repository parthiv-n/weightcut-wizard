import { X, RefreshCw, Sparkles } from "lucide-react";
import type { DietAnalysisResult } from "@/types/dietAnalysis";

const NUTRIENT_COLORS: Record<string, string> = {
  "Vitamin A": "#f59e0b",
  "Vitamin C": "#ef4444",
  "Vitamin D": "#eab308",
  "Iron": "#dc2626",
  "Calcium": "#14b8a6",
  "Magnesium": "#10b981",
  "Zinc": "#0ea5e9",
  "Fiber": "#84cc16",
};

const SEVERITY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-500" },
  moderate: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-500" },
  low: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-500" },
};

interface NutrientRingProps {
  name: string;
  percentRDA: number;
  color: string;
}

function NutrientRing({ name, percentRDA, color }: NutrientRingProps) {
  const size = 68;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(percentRDA / 100, 1);
  const offset = circumference * (1 - progress);
  const filterId = `glow-diet-${name.replace(/\s/g, "")}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-border/30"
          />
          {progress > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              filter={`url(#${filterId})`}
              style={{ transition: "stroke-dashoffset 0.8s ease" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="display-number text-xs font-bold leading-none" style={{ color }}>
            {percentRDA}%
          </span>
        </div>
      </div>
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground text-center leading-tight">
        {name}
      </span>
    </div>
  );
}

interface DietAnalysisCardProps {
  analysis: DietAnalysisResult;
  onDismiss: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function DietAnalysisCard({ analysis, onDismiss, onRefresh, refreshing }: DietAnalysisCardProps) {
  return (
    <div className="glass-card p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Diet Analysis
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground/80 leading-relaxed">{analysis.summary}</p>

      {/* Micronutrient Rings */}
      {analysis.micronutrients.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground text-center mb-3">
            Micronutrients
          </p>
          <div className="grid grid-cols-4 gap-3 justify-items-center">
            {analysis.micronutrients.map((nutrient) => (
              <NutrientRing
                key={nutrient.name}
                name={nutrient.name}
                percentRDA={nutrient.percentRDA}
                color={NUTRIENT_COLORS[nutrient.name] || "#888"}
              />
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {analysis.gaps.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            What's Lacking
          </p>
          <div className="space-y-2">
            {analysis.gaps.map((gap) => {
              const style = SEVERITY_STYLES[gap.severity] || SEVERITY_STYLES.low;
              return (
                <div key={gap.nutrient} className={`rounded-xl px-3 py-2.5 ${style.bg}`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    <span className={`text-xs font-semibold ${style.text}`}>
                      {gap.nutrient}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {gap.percentRDA}% RDA
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug pl-3.5">
                    {gap.reason}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {analysis.suggestions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Suggested Foods
          </p>
          <div className="space-y-2">
            {analysis.suggestions.map((suggestion, i) => (
              <div key={i} className="rounded-xl border border-border/50 px-3 py-2.5">
                <p className="text-xs font-semibold text-foreground">{suggestion.food}</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  {suggestion.reason}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {suggestion.nutrients.map((n) => (
                    <span
                      key={n}
                      className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
