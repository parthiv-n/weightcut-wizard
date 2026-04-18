import { useState, useEffect, useCallback } from "react";
import { Activity, Ruler, Plus, X, Check, Route, Timer, Gauge, Mic, MicOff } from "lucide-react";
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
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { triggerHapticSelection } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";

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
  notes: string;
  setNotes: (v: string) => void;
  runDistance: string;
  setRunDistance: (v: string) => void;
  runTime: string;
  setRunTime: (v: string) => void;
  runDistanceUnit: "km" | "mi";
  setRunDistanceUnit: (v: "km" | "mi") => void;
  runPace: string;
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
  notes, setNotes,
  runDistance, setRunDistance,
  runTime, setRunTime,
  runDistanceUnit, setRunDistanceUnit,
  runPace,
  onSave,
}: FightCampLogFormProps) {
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const { toast } = useToast();

  const handleVoiceTranscript = useCallback((text: string) => {
    setNotes(prev => prev ? prev + " " + text : text);
  }, [setNotes]);

  const handleVoiceError = useCallback((error: string) => {
    toast({ title: "Voice Input", description: error, variant: "destructive" });
  }, [toast]);

  const { isListening, isSupported: voiceSupported, startListening, stopListening, interimText } = useSpeechRecognition({
    onTranscript: handleVoiceTranscript,
    onError: handleVoiceError,
  });

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
    <div className="grid gap-3 py-1">
      {/* Session Type */}
      <div className="space-y-1.5">
        <Label className="text-[10px] font-medium text-foreground/50 uppercase tracking-widest">Type</Label>
        <div className="flex gap-1.5">
          <Select value={sessionType} onValueChange={setSessionType}>
            <SelectTrigger className="flex-1 rounded-2xl h-10 text-[13px] border-border/20 bg-muted/15">
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
          <button
            className="h-10 w-10 rounded-2xl bg-muted/15 flex items-center justify-center shrink-0 active:bg-muted/30 transition-colors border border-border/20"
            onClick={() => setIsAddingNew(!isAddingNew)}
            aria-label="Add custom type"
          >
            <Plus className="h-4 w-4 text-foreground/60" />
          </button>
        </div>

        {isAddingNew && (
          <div className="flex gap-1.5 mt-1">
            <Input
              placeholder="e.g. Swimming, Yoga..."
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomType(); }}
              className="rounded-lg flex-1 h-8 text-[13px] border-border/30 bg-muted/20"
              autoFocus
            />
            <button
              className="h-8 w-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0 active:bg-muted/50 transition-colors disabled:opacity-40"
              onClick={handleAddCustomType}
              disabled={!newTypeName.trim()}
              aria-label="Confirm new type"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Training Metrics */}
      <div className="rounded-2xl bg-muted/10 border border-border/15 overflow-hidden">
        {/* Duration */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-border/10">
          <span className="text-[13px] text-foreground/70">Duration</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setDuration(String(Math.max(0, parseInt(duration) - 5)))}
              className="h-5 w-5 rounded-full bg-muted/40 flex items-center justify-center text-[12px] font-medium active:bg-muted/60 transition-colors">
              −
            </button>
            <span className="text-[13px] font-semibold tabular-nums w-8 text-center">{duration}<span className="text-[10px] text-muted-foreground ml-0.5">m</span></span>
            <button onClick={() => setDuration(String(parseInt(duration) + 5))}
              className="h-5 w-5 rounded-full bg-muted/40 flex items-center justify-center text-[12px] font-medium active:bg-muted/60 transition-colors">
              +
            </button>
          </div>
        </div>

        {/* Intensity */}
        <div className="px-3.5 py-3 border-b border-border/10">
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-foreground/70">Intensity</span>
            <span className="text-[13px] font-semibold tabular-nums">{intensityLevel[0]}<span className="text-foreground/40">/5</span></span>
          </div>
          <Slider value={intensityLevel} onValueChange={setIntensityLevel} max={5} min={1} step={1} className="py-1" />
          <div className="flex justify-between text-[9px] text-muted-foreground/70">
            <span>Easy</span>
            <span>Mod</span>
            <span>Max</span>
          </div>
        </div>

        {/* RPE */}
        <div className="px-3.5 py-3">
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-foreground/70">RPE</span>
            <span className="text-[13px] font-semibold tabular-nums">{rpe[0]}<span className="text-foreground/40">/10</span></span>
          </div>
          <Slider value={rpe} onValueChange={setRpe} max={10} min={1} step={1} className="py-1" />
          <div className="flex justify-between text-[9px] text-muted-foreground/70">
            <span>Light</span>
            <span>Max</span>
          </div>
        </div>
      </div>

      {/* Run Details */}
      {sessionType === "Run" && (
        <div className="rounded-2xl bg-muted/10 border border-border/15 overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-border/10">
            <span className="text-[13px] text-foreground/70">Distance</span>
            <div className="flex items-center gap-1.5">
              <Input type="number" inputMode="decimal" step="0.1" min="0" value={runDistance} onChange={(e) => setRunDistance(e.target.value)} placeholder="0"
                className="w-16 h-7 rounded-md text-right text-[12px] font-semibold bg-transparent border-border/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <button type="button" onClick={() => setRunDistanceUnit(runDistanceUnit === "km" ? "mi" : "km")}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted/40 active:bg-muted/60 transition-colors min-w-[28px]">
                {runDistanceUnit}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-border/10">
            <span className="text-[13px] text-foreground/70">Time</span>
            <Input type="text" inputMode="numeric" value={runTime} onChange={(e) => setRunTime(e.target.value)} placeholder="mm:ss"
              className="w-20 h-7 rounded-md text-right text-[12px] font-semibold bg-transparent border-border/30" />
          </div>
          <div className="flex items-center justify-between px-3.5 py-3">
            <span className="text-[13px] text-foreground/70">Pace</span>
            <span className="text-[12px] font-semibold text-foreground/70">{runPace ? `${runPace} /${runDistanceUnit}` : "—"}</span>
          </div>
        </div>
      )}

      {/* Recovery */}
      <div className="rounded-2xl bg-muted/10 border border-border/15 overflow-hidden">
        {/* Soreness */}
        <div className="px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-foreground/70">Soreness</span>
            <Switch checked={hasSoreness} onCheckedChange={setHasSoreness} />
          </div>
          {hasSoreness && (
            <div className="pt-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">Level</span>
                <span className="text-[13px] font-semibold">{sorenessLevel[0]}</span>
              </div>
              <Slider value={sorenessLevel} onValueChange={setSorenessLevel} max={10} min={1} step={1} className="py-1" />
            </div>
          )}
        </div>

      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-medium text-foreground/50 uppercase tracking-widest">Notes</Label>
          {voiceSupported && (
            <button
              type="button"
              onClick={() => { triggerHapticSelection(); isListening ? stopListening() : startListening(); }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                isListening
                  ? "bg-red-500/15 text-red-500 animate-pulse"
                  : "bg-muted/30 text-muted-foreground active:bg-muted/50"
              }`}
            >
              {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
              {isListening ? "Stop" : "Voice"}
            </button>
          )}
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={isListening ? "Listening..." : "Techniques, drills, notes..."}
          className={`rounded-2xl border-border/15 bg-muted/10 min-h-[50px] resize-none text-[13px] ${isListening ? "border-red-500/30" : ""}`}
        />
        {isListening && interimText && (
          <p className="text-[10px] text-muted-foreground/60 italic px-1">{interimText}</p>
        )}
      </div>

      <button className="w-full h-11 rounded-2xl bg-primary text-primary-foreground text-[14px] font-semibold active:opacity-80 transition-opacity mt-1" onClick={onSave}>
        {isEditing ? 'Update Session' : 'Save Session'}
      </button>
    </div>
  );
}
