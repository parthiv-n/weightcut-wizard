import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Shield,
  Activity,
} from "lucide-react";
import { AIGeneratingOverlay } from "@/components/AIGeneratingOverlay";

export interface FightWeekAIAdvice {
  summary: string;
  dayByDayTips: string[];
  safetyWarning: string | null;
  recoveryProtocol: string;
  riskLevel: "green" | "orange" | "red";
}

interface AIAdviceCardProps {
  advice: FightWeekAIAdvice | null;
  isGenerating: boolean;
  onGenerate: () => void;
}

const AI_STEPS = [
  { icon: Activity, label: "Analyzing projection data", color: "text-blue-400" },
  { icon: Shield, label: "Checking safety thresholds", color: "text-green-500" },
  { icon: Sparkles, label: "Generating protocol advice", color: "text-yellow-400" },
];

export function AIAdviceCard({ advice, isGenerating, onGenerate }: AIAdviceCardProps) {
  const [tipsOpen, setTipsOpen] = useState(false);

  return (
    <>
      <AIGeneratingOverlay
        isOpen={isGenerating}
        isGenerating={isGenerating}
        steps={AI_STEPS}
        title="Generating Advice"
        subtitle="Building your research-backed protocol..."
      />

      <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI Coach
            </h3>
            {advice && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={onGenerate}
                disabled={isGenerating}
              >
                Refresh
              </Button>
            )}
          </div>

          {!advice && !isGenerating && (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Get AI-generated advice based on your projection
              </p>
              <Button onClick={onGenerate} disabled={isGenerating} className="rounded-xl">
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Advice
              </Button>
            </div>
          )}

          {advice && (
            <div className="space-y-4">
              {/* Summary */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {advice.summary}
              </p>

              {/* Safety warning */}
              {advice.safetyWarning && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-300">{advice.safetyWarning}</p>
                </div>
              )}

              {/* Day-by-day tips — collapsible */}
              {advice.dayByDayTips.length > 0 && (
                <div className="border-t border-border pt-3">
                  <button
                    className="w-full flex items-center justify-between text-left"
                    onClick={() => setTipsOpen(o => !o)}
                  >
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Day-by-Day Tips
                    </span>
                    {tipsOpen
                      ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    }
                  </button>
                  {tipsOpen && (
                    <ul className="mt-3 space-y-2">
                      {advice.dayByDayTips.map((tip, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex gap-2">
                          <span className="text-primary mt-0.5">-</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Recovery protocol */}
              {advice.recoveryProtocol && (
                <div className="border-t border-border pt-3 space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Post Weigh-In Recovery
                  </span>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {advice.recoveryProtocol}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Disclaimer footer */}
        <div className="bg-muted/30 px-5 py-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground/60 text-center">
            This is not medical advice. Consult a professional before any weight cut.
          </p>
        </div>
      </div>
    </>
  );
}
