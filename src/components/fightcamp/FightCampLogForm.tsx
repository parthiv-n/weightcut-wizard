import { Activity, Moon, Ruler, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const SESSION_TYPES = [
  "BJJ", "Muay Thai", "Boxing", "Wrestling", "Sparring", "Strength", "Conditioning", "Run", "Recovery", "Rest", "Other"
];

export { SESSION_TYPES };

interface FightCampLogFormProps {
  isEditing: boolean;
  sessionType: string;
  setSessionType: (v: string) => void;
  customType: string;
  setCustomType: (v: string) => void;
  duration: string;
  setDuration: (v: string) => void;
  rpe: number[];
  setRpe: (v: number[]) => void;
  intensityLevel: number[];
  setIntensityLevel: (v: number[]) => void;
  hasSoreness: boolean;
  setHasSoreness: (v: boolean) => void;
  sorenessLevel: number[];
  setSorenessLevel: (v: number[]) => void;
  sleepHours: string;
  setSleepHours: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  fatigue: number[];
  setFatigue: (v: number[]) => void;
  sleepQuality: 'good' | 'poor';
  setSleepQuality: (v: 'good' | 'poor') => void;
  mobilityDone: boolean;
  setMobilityDone: (v: boolean) => void;
  onSave: () => void;
}

export function FightCampLogForm({
  isEditing,
  sessionType, setSessionType,
  customType, setCustomType,
  duration, setDuration,
  rpe, setRpe,
  intensityLevel, setIntensityLevel,
  hasSoreness, setHasSoreness,
  sorenessLevel, setSorenessLevel,
  sleepHours, setSleepHours,
  notes, setNotes,
  fatigue, setFatigue,
  sleepQuality, setSleepQuality,
  mobilityDone, setMobilityDone,
  onSave,
}: FightCampLogFormProps) {
  const isRestDay = sessionType === 'Rest';

  return (
    <div className="grid gap-4 py-3">
      {/* Session Type — pill chips */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-muted-foreground">SESSION TYPE</Label>
        <div className="flex flex-wrap gap-2">
          {SESSION_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setSessionType(type)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all
                ${sessionType === type
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-accent/40 text-foreground/70 hover:bg-accent/60'}`}
            >
              {type}
            </button>
          ))}
        </div>
        {sessionType === 'Other' && (
          <Input
            placeholder="e.g. Swimming, Yoga, MMA..."
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            className="mt-2 rounded-xl"
            autoFocus
          />
        )}
      </div>

      {!isRestDay && (
        <>
          {/* Duration — compact stepper */}
          <div className="flex items-center justify-between bg-accent/20 px-4 py-3 rounded-2xl border border-border/50">
            <Label className="text-sm font-semibold text-muted-foreground">DURATION</Label>
            <div className="flex items-center gap-3">
              <button onClick={() => setDuration(String(Math.max(0, parseInt(duration) - 5)))}
                className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-base font-medium hover:bg-muted transition-colors">
                −
              </button>
              <span className="text-xl font-bold display-number w-12 text-center">{duration}<span className="text-xs text-muted-foreground ml-0.5">m</span></span>
              <button onClick={() => setDuration(String(parseInt(duration) + 5))}
                className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-base font-medium hover:bg-muted transition-colors">
                +
              </button>
            </div>
          </div>

          {/* Intensity — 1-5 slider */}
          <div className="space-y-2 bg-accent/30 p-3 rounded-2xl">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold flex items-center gap-1">
                <Ruler className="h-4 w-4 text-primary" /> INTENSITY
              </Label>
              <span className="font-bold text-lg">{intensityLevel[0]}</span>
            </div>
            <Slider
              value={intensityLevel}
              onValueChange={setIntensityLevel}
              max={5}
              min={1}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span>1 (Easy)</span>
              <span>3 (Mod)</span>
              <span>5 (Max)</span>
            </div>
          </div>

          {/* RPE */}
          <div className="space-y-2 bg-accent/30 p-3 rounded-2xl">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold flex items-center gap-1">
                <Activity className="h-4 w-4 text-primary" /> RPE
              </Label>
              <span className="font-bold text-lg">{rpe[0]}</span>
            </div>
            <Slider
              value={rpe}
              onValueChange={setRpe}
              max={10}
              min={1}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span>1 (Light)</span>
              <span>10 (Max)</span>
            </div>
          </div>
        </>
      )}

      {/* Soreness — shown for both training and rest days */}
      <div className="space-y-2 bg-accent/30 p-3 rounded-2xl">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">SORENESS</Label>
          {!isRestDay && <Switch checked={hasSoreness} onCheckedChange={setHasSoreness} />}
        </div>

        {(isRestDay || hasSoreness) && (
          <div className="pt-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Level</span>
              <span className="font-bold text-lg">{sorenessLevel[0]}</span>
            </div>
            <Slider
              value={sorenessLevel}
              onValueChange={setSorenessLevel}
              max={10}
              min={1}
              step={1}
              className="py-2"
            />
          </div>
        )}
      </div>

      {/* Rest Day specific fields */}
      {isRestDay && (
        <>
          {/* Fatigue */}
          <div className="space-y-2 bg-accent/30 p-3 rounded-2xl">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold">FATIGUE</Label>
              <span className="font-bold text-lg">{fatigue[0]}</span>
            </div>
            <Slider
              value={fatigue}
              onValueChange={setFatigue}
              max={10}
              min={1}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span>1 (Fresh)</span>
              <span>10 (Exhausted)</span>
            </div>
          </div>

          {/* Sleep Quality */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-muted-foreground">SLEEP QUALITY</Label>
            <div className="flex gap-1.5">
              {(['good', 'poor'] as const).map(quality => (
                <button
                  key={quality}
                  onClick={() => setSleepQuality(quality)}
                  className={`flex-1 py-2 rounded-full text-sm font-medium capitalize transition-all
                    ${sleepQuality === quality
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-accent/40 text-foreground/70 hover:bg-accent/60'}`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {quality === 'good'
                      ? <Moon className="h-3.5 w-3.5" />
                      : <CircleX className="h-3.5 w-3.5" />}
                    {quality === 'good' ? 'Good' : 'Poor'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Mobility */}
          <div className="flex items-center justify-between bg-accent/20 px-4 py-3 rounded-2xl border border-border/50">
            <Label className="text-sm font-semibold text-muted-foreground">MOBILITY WORK DONE?</Label>
            <Switch checked={mobilityDone} onCheckedChange={setMobilityDone} />
          </div>
        </>
      )}

      {/* Sleep — compact stepper (shown for all) */}
      <div className="flex items-center justify-between bg-accent/20 px-4 py-3 rounded-2xl border border-border/50">
        <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
          <Moon className="h-3.5 w-3.5" /> SLEEP
        </Label>
        <div className="flex items-center gap-3">
          <button onClick={() => setSleepHours(String(Math.max(0, parseFloat(sleepHours) - 0.5)))}
            className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-base font-medium hover:bg-muted transition-colors">
            −
          </button>
          <span className="text-xl font-bold display-number w-12 text-center">{sleepHours}<span className="text-xs text-muted-foreground ml-0.5">h</span></span>
          <button onClick={() => setSleepHours(String(parseFloat(sleepHours) + 0.5))}
            className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-base font-medium hover:bg-muted transition-colors">
            +
          </button>
        </div>
      </div>

      {/* Session Notes — training days only */}
      {!isRestDay && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-muted-foreground">SESSION NOTES</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you work on? Techniques, drills, combos..."
            className="bg-accent/20 border-border/50 rounded-2xl min-h-[80px] resize-none text-sm"
          />
        </div>
      )}

      <Button
        className="w-full h-12 rounded-2xl text-lg font-bold mt-2 shadow-lg"
        onClick={onSave}
      >
        {isEditing ? 'Update Session' : isRestDay ? 'Log Rest Day' : 'Save Session'}
      </Button>
    </div>
  );
}
