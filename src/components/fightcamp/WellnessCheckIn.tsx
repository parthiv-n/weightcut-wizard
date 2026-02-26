import { useState } from "react";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import type { WellnessCheckIn as WellnessCheckInData } from "@/utils/performanceEngine";

interface WellnessCheckInProps {
  userId: string;
  onSubmit: (checkIn: WellnessCheckInData) => void;
  isSubmitting?: boolean;
}

const HOOPER_DIMENSIONS = [
  {
    key: 'sleep_quality' as const,
    label: 'Sleep Quality',
    leftLabel: 'Slept great',
    rightLabel: 'Barely slept',
    defaultValue: 2,
  },
  {
    key: 'stress_level' as const,
    label: 'Stress',
    leftLabel: 'Very calm',
    rightLabel: 'Extremely stressed',
    defaultValue: 3,
  },
  {
    key: 'fatigue_level' as const,
    label: 'Fatigue',
    leftLabel: 'Fresh',
    rightLabel: 'Exhausted',
    defaultValue: 3,
  },
  {
    key: 'soreness_level' as const,
    label: 'Soreness',
    leftLabel: 'No soreness',
    rightLabel: 'Can barely move',
    defaultValue: 3,
  },
] as const;

function getSliderColor(value: number): string {
  if (value <= 2) return 'bg-green-500';
  if (value <= 4) return 'bg-yellow-500';
  if (value <= 5) return 'bg-orange-500';
  return 'bg-red-500';
}

function getThumbColor(value: number): string {
  if (value <= 2) return 'border-green-500';
  if (value <= 4) return 'border-yellow-500';
  if (value <= 5) return 'border-orange-500';
  return 'border-red-500';
}

export function WellnessCheckIn({ userId, onSubmit, isSubmitting }: WellnessCheckInProps) {
  const [values, setValues] = useState({
    sleep_quality: 2,
    stress_level: 3,
    fatigue_level: 3,
    soreness_level: 3,
  });

  const [showOptional, setShowOptional] = useState(false);
  const [optionalValues, setOptionalValues] = useState({
    sleep_hours: null as number | null,
    hydration_feeling: null as number | null,
    appetite_level: null as number | null,
    energy_level: null as number | null,
    motivation_level: null as number | null,
  });

  const hooperIndex = values.sleep_quality + (8 - values.stress_level) + (8 - values.fatigue_level) + (8 - values.soreness_level);

  const handleSubmit = async () => {
    const checkInData: WellnessCheckInData = {
      sleep_quality: values.sleep_quality,
      stress_level: values.stress_level,
      fatigue_level: values.fatigue_level,
      soreness_level: values.soreness_level,
      energy_level: optionalValues.energy_level,
      motivation_level: optionalValues.motivation_level,
      sleep_hours: optionalValues.sleep_hours,
      hydration_feeling: optionalValues.hydration_feeling,
      appetite_level: optionalValues.appetite_level,
      hooper_index: hooperIndex,
    };

    const today = new Date().toISOString().split('T')[0];

    // Persist to database
    try {
      await supabase.from('daily_wellness_checkins').upsert({
        user_id: userId,
        date: today,
        ...values,
        energy_level: optionalValues.energy_level,
        motivation_level: optionalValues.motivation_level,
        sleep_hours: optionalValues.sleep_hours,
        hydration_feeling: optionalValues.hydration_feeling,
        appetite_level: optionalValues.appetite_level,
      }, { onConflict: 'user_id,date' });
    } catch (err) {
      console.error('Failed to persist wellness check-in:', err);
    }

    onSubmit(checkInData);
  };

  const hooperLabel = hooperIndex >= 22 ? 'Great' : hooperIndex >= 16 ? 'Good' : hooperIndex >= 10 ? 'Fair' : 'Poor';
  const hooperColor = hooperIndex >= 22 ? 'text-green-400' : hooperIndex >= 16 ? 'text-blue-400' : hooperIndex >= 10 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Morning wellness check-in (Hooper Index)</p>
        <div className={`text-xs font-bold ${hooperColor}`}>
          {hooperIndex}/28 · {hooperLabel}
        </div>
      </div>

      {/* Core Hooper dimensions */}
      {HOOPER_DIMENSIONS.map((dim) => {
        const value = values[dim.key];
        return (
          <div key={dim.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/80">{dim.label}</span>
              <span className="text-xs font-bold text-foreground/60 tabular-nums w-4 text-right">{value}</span>
            </div>
            <div className="relative">
              <Slider
                value={[value]}
                onValueChange={([v]) => setValues(prev => ({ ...prev, [dim.key]: v }))}
                min={1}
                max={7}
                step={1}
                className="w-full [&_[data-radix-slider-range]]:transition-colors"
                style={{
                  // @ts-expect-error CSS custom properties
                  '--slider-range-bg': value <= 2 ? '#22c55e' : value <= 4 ? '#eab308' : value <= 5 ? '#f97316' : '#ef4444',
                  '--slider-thumb-border': value <= 2 ? '#22c55e' : value <= 4 ? '#eab308' : value <= 5 ? '#f97316' : '#ef4444',
                }}
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-[9px] text-muted-foreground/60">{dim.leftLabel}</span>
                <span className="text-[9px] text-muted-foreground/60">{dim.rightLabel}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Optional fields toggle */}
      <button
        type="button"
        onClick={() => setShowOptional(!showOptional)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground/80 transition-colors"
      >
        {showOptional ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        More detail (optional)
      </button>

      {showOptional && (
        <div className="space-y-3 pl-1 border-l-2 border-border/30 ml-1">
          {/* Sleep hours */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/70">Sleep hours</span>
              <span className="text-xs font-bold text-foreground/60 tabular-nums">
                {optionalValues.sleep_hours != null ? `${optionalValues.sleep_hours}h` : '—'}
              </span>
            </div>
            <Slider
              value={[optionalValues.sleep_hours ?? 7]}
              onValueChange={([v]) => setOptionalValues(prev => ({ ...prev, sleep_hours: v }))}
              min={3}
              max={12}
              step={0.5}
              className="w-full"
            />
            <div className="flex justify-between">
              <span className="text-[9px] text-muted-foreground/60">3h</span>
              <span className="text-[9px] text-muted-foreground/60">12h</span>
            </div>
          </div>

          {/* Hydration */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/70">Hydration</span>
              <span className="text-xs font-bold text-foreground/60 tabular-nums">
                {optionalValues.hydration_feeling != null ? `${optionalValues.hydration_feeling}/5` : '—'}
              </span>
            </div>
            <Slider
              value={[optionalValues.hydration_feeling ?? 3]}
              onValueChange={([v]) => setOptionalValues(prev => ({ ...prev, hydration_feeling: v }))}
              min={1}
              max={5}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between">
              <span className="text-[9px] text-muted-foreground/60">Dehydrated</span>
              <span className="text-[9px] text-muted-foreground/60">Well hydrated</span>
            </div>
          </div>

          {/* Appetite */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/70">Appetite</span>
              <span className="text-xs font-bold text-foreground/60 tabular-nums">
                {optionalValues.appetite_level != null ? `${optionalValues.appetite_level}/5` : '—'}
              </span>
            </div>
            <Slider
              value={[optionalValues.appetite_level ?? 3]}
              onValueChange={([v]) => setOptionalValues(prev => ({ ...prev, appetite_level: v }))}
              min={1}
              max={5}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between">
              <span className="text-[9px] text-muted-foreground/60">No appetite</span>
              <span className="text-[9px] text-muted-foreground/60">Very hungry</span>
            </div>
          </div>

          {/* Energy */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/70">Energy</span>
              <span className="text-xs font-bold text-foreground/60 tabular-nums">
                {optionalValues.energy_level != null ? `${optionalValues.energy_level}/7` : '—'}
              </span>
            </div>
            <Slider
              value={[optionalValues.energy_level ?? 4]}
              onValueChange={([v]) => setOptionalValues(prev => ({ ...prev, energy_level: v }))}
              min={1}
              max={7}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between">
              <span className="text-[9px] text-muted-foreground/60">Empty</span>
              <span className="text-[9px] text-muted-foreground/60">Fired up</span>
            </div>
          </div>

          {/* Motivation */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/70">Motivation</span>
              <span className="text-xs font-bold text-foreground/60 tabular-nums">
                {optionalValues.motivation_level != null ? `${optionalValues.motivation_level}/7` : '—'}
              </span>
            </div>
            <Slider
              value={[optionalValues.motivation_level ?? 4]}
              onValueChange={([v]) => setOptionalValues(prev => ({ ...prev, motivation_level: v }))}
              min={1}
              max={7}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between">
              <span className="text-[9px] text-muted-foreground/60">Need a break</span>
              <span className="text-[9px] text-muted-foreground/60">Ready to go</span>
            </div>
          </div>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full rounded-2xl h-12 font-semibold gap-2 mt-1"
        variant="outline"
      >
        <Brain className="h-4 w-4" />
        {isSubmitting ? 'Analyzing...' : 'Submit & Get Coach Advice'}
      </Button>
    </div>
  );
}
