import { useState, useEffect } from "react";
import { Activity, Moon, Ruler, Plus, X, Check } from "lucide-react";
import { SessionMediaPicker } from "@/components/fightcamp/SessionMediaPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCustomTypes, addCustomType, removeCustomType } from "@/lib/customSessionTypes";

const SESSION_TYPES = ["BJJ", "Muay Thai", "Boxing", "Wrestling", "Sparring", "Strength", "Run"];

export { SESSION_TYPES };

interface FightCampLogFormProps {
  isEditing: boolean;
  userId: string | null;
  sessionType: string;
  setSessionType: (v: string) => void;
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
  mediaPreviewUrl: string | null;
  existingMediaUrl: string | null;
  onMediaSelected: (file: File, previewUrl: string) => void;
  onMediaRemoved: () => void;
  onSave: () => void;
}

export function FightCampLogForm({
  isEditing,
  userId,
  sessionType, setSessionType,
  duration, setDuration,
  rpe, setRpe,
  intensityLevel, setIntensityLevel,
  hasSoreness, setHasSoreness,
  sorenessLevel, setSorenessLevel,
  sleepHours, setSleepHours,
  notes, setNotes,
  mediaPreviewUrl, existingMediaUrl,
  onMediaSelected, onMediaRemoved,
  onSave,
}: FightCampLogFormProps) {
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  useEffect(() => {
    if (userId) setCustomTypes(getCustomTypes(userId));
  }, [userId]);

  // Build full list of types for the dropdown
  const allTypes = [...SESSION_TYPES, ...customTypes];
  // If editing a session with a legacy/unknown type, include it temporarily
  const hasLegacyType = sessionType && !allTypes.includes(sessionType);
  const displayTypes = hasLegacyType ? [...allTypes, sessionType] : allTypes;

  const handleAddCustomType = () => {
    const trimmed = newTypeName.trim();
    if (!trimmed || !userId) return;
    if (allTypes.includes(trimmed)) return;
    const updated = addCustomType(userId, trimmed);
    setCustomTypes(updated);
    setSessionType(trimmed);
    setNewTypeName("");
    setIsAddingNew(false);
  };

  const handleRemoveCustomType = (type: string) => {
    if (!userId) return;
    const updated = removeCustomType(userId, type);
    setCustomTypes(updated);
    if (sessionType === type) {
      setSessionType(SESSION_TYPES[0]);
    }
  };

  return (
    <div className="grid gap-3 py-3">
      {/* Session Type — Select dropdown + Add button */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-muted-foreground">SESSION TYPE</Label>
        <div className="flex gap-2">
          <Select value={sessionType} onValueChange={setSessionType}>
            <SelectTrigger className="flex-1 rounded-xl h-11">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {SESSION_TYPES.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
              {customTypes.length > 0 && <SelectSeparator />}
              {customTypes.map(type => (
                <div key={type} className="relative flex items-center">
                  <SelectItem value={type} className="flex-1 pr-8">{type}</SelectItem>
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleRemoveCustomType(type);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors z-10"
                    aria-label={`Remove ${type}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {hasLegacyType && (
                <>
                  <SelectSeparator />
                  <SelectItem value={sessionType}>{sessionType}</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-xl shrink-0"
            onClick={() => setIsAddingNew(!isAddingNew)}
            aria-label="Add custom type"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {isAddingNew && (
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="e.g. Swimming, Yoga, MMA..."
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomType(); }}
              className="rounded-xl flex-1"
              autoFocus
            />
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl shrink-0"
              onClick={handleAddCustomType}
              disabled={!newTypeName.trim()}
              aria-label="Confirm new type"
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Group 1: Training Metrics */}
      <div className="rounded-2xl border border-border/10 overflow-hidden">
        {/* Duration */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
          <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">Duration</span>
          <div className="flex items-center gap-2.5">
            <button onClick={() => setDuration(String(Math.max(0, parseInt(duration) - 5)))}
              className="h-6 w-6 rounded-full bg-white/5 border border-border/30 flex items-center justify-center text-sm font-medium hover:bg-white/10 transition-colors">
              −
            </button>
            <span className="text-base font-semibold display-number w-10 text-center">{duration}<span className="text-[11px] text-muted-foreground ml-0.5">m</span></span>
            <button onClick={() => setDuration(String(parseInt(duration) + 5))}
              className="h-6 w-6 rounded-full bg-white/5 border border-border/30 flex items-center justify-center text-sm font-medium hover:bg-white/10 transition-colors">
              +
            </button>
          </div>
        </div>

        {/* Intensity */}
        <div className="px-4 py-3 border-b border-border/10">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5 text-primary" /> Intensity
            </span>
            <span className="text-base font-semibold">{intensityLevel[0]}</span>
          </div>
          <Slider
            value={intensityLevel}
            onValueChange={setIntensityLevel}
            max={5}
            min={1}
            step={1}
            className="py-1"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground/70 mt-0.5">
            <span>1 (Easy)</span>
            <span>3 (Mod)</span>
            <span>5 (Max)</span>
          </div>
        </div>

        {/* RPE */}
        <div className="px-4 py-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground flex items-center gap-1">
              <Activity className="h-3.5 w-3.5 text-primary" /> RPE
            </span>
            <span className="text-base font-semibold">{rpe[0]}</span>
          </div>
          <Slider
            value={rpe}
            onValueChange={setRpe}
            max={10}
            min={1}
            step={1}
            className="py-1"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground/70 mt-0.5">
            <span>1 (Light)</span>
            <span>10 (Max)</span>
          </div>
        </div>
      </div>

      {/* Group 2: Recovery */}
      <div className="rounded-2xl border border-border/10 overflow-hidden">
        {/* Soreness */}
        <div className="px-4 py-3 border-b border-border/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">Soreness</span>
            <Switch checked={hasSoreness} onCheckedChange={setHasSoreness} />
          </div>
          {hasSoreness && (
            <div className="pt-2 pb-0.5">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] text-muted-foreground">Level</span>
                <span className="text-base font-semibold">{sorenessLevel[0]}</span>
              </div>
              <Slider
                value={sorenessLevel}
                onValueChange={setSorenessLevel}
                max={10}
                min={1}
                step={1}
                className="py-1"
              />
            </div>
          )}
        </div>

        {/* Sleep */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground flex items-center gap-1">
            <Moon className="h-3.5 w-3.5" /> Sleep
          </span>
          <div className="flex items-center gap-2.5">
            <button onClick={() => setSleepHours(String(Math.max(0, parseFloat(sleepHours) - 0.5)))}
              className="h-6 w-6 rounded-full bg-white/5 border border-border/30 flex items-center justify-center text-sm font-medium hover:bg-white/10 transition-colors">
              −
            </button>
            <span className="text-base font-semibold display-number w-10 text-center">{sleepHours}<span className="text-[11px] text-muted-foreground ml-0.5">h</span></span>
            <button onClick={() => setSleepHours(String(parseFloat(sleepHours) + 0.5))}
              className="h-6 w-6 rounded-full bg-white/5 border border-border/30 flex items-center justify-center text-sm font-medium hover:bg-white/10 transition-colors">
              +
            </button>
          </div>
        </div>
      </div>

      {/* Session Notes */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-muted-foreground">SESSION NOTES</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What did you work on? Techniques, drills, combos..."
          className="bg-accent/20 border-border/50 rounded-2xl min-h-[80px] resize-none text-sm"
        />
      </div>

      {/* Media */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-muted-foreground">MEDIA</Label>
        <SessionMediaPicker
          mediaPreviewUrl={mediaPreviewUrl}
          existingMediaUrl={existingMediaUrl}
          onMediaSelected={onMediaSelected}
          onMediaRemoved={onMediaRemoved}
        />
      </div>

      <Button
        className="w-full h-12 rounded-2xl text-lg font-bold mt-2 shadow-lg"
        onClick={onSave}
      >
        {isEditing ? 'Update Session' : 'Save Session'}
      </Button>
    </div>
  );
}
