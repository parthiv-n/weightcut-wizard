import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Trophy, Scale, Droplets, TrendingDown, Upload, Camera, CheckCircle2, FileText, Zap, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { ShareCardDialog } from "@/components/share/ShareCardDialog";
import { FightCampSummaryCard } from "@/components/share/cards/FightCampSummaryCard";

interface FightCamp {
  id: string;
  name: string;
  event_name: string | null;
  fight_date: string;
  profile_pic_url: string | null;
  starting_weight_kg: number | null;
  end_weight_kg: number | null;
  total_weight_cut: number | null;
  weight_via_dehydration: number | null;
  weight_via_carb_reduction: number | null;
  weigh_in_timing: string | null;
  rehydration_notes: string | null;
  performance_feeling: string | null;
  is_completed: boolean;
}

export default function FightCampDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { safeAsync, isMounted } = useSafeAsync();
  const [camp, setCamp] = useState<FightCamp | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    fetchCampDetails();
  }, [id]);

  const fetchCampDetails = async () => {
    if (!id) return;

    safeAsync(setLoading)(true);
    try {
      const { data, error } = await withSupabaseTimeout(
        supabase
          .from("fight_camps")
          .select("*")
          .eq("id", id)
          .single(),
        undefined,
        "Load fight camp details"
      );

      if (!isMounted()) return;

      if (error) {
        toast({ title: "Error", description: "Failed to load fight camp", variant: "destructive" });
        navigate("/fight-camps");
      } else {
        setCamp(data);
      }
    } catch {
      if (!isMounted()) return;
      toast({ title: "Error", description: "Failed to load fight camp", variant: "destructive" });
      navigate("/fight-camps");
    }
    safeAsync(setLoading)(false);
  };

  const handleUpdate = async () => {
    if (!camp) return;

    const { error } = await supabase
      .from("fight_camps")
      .update({
        starting_weight_kg: camp.starting_weight_kg,
        end_weight_kg: camp.end_weight_kg,
        total_weight_cut: camp.total_weight_cut,
        weight_via_dehydration: camp.weight_via_dehydration,
        weight_via_carb_reduction: camp.weight_via_carb_reduction,
        weigh_in_timing: camp.weigh_in_timing,
        rehydration_notes: camp.rehydration_notes,
        performance_feeling: camp.performance_feeling,
        is_completed: camp.is_completed,
      })
      .eq("id", camp.id);

    if (error) {
      toast({ title: "Error", description: "Failed to update camp", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Camp updated successfully" });
      navigate("/fight-camps");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !camp) return;

    const file = e.target.files[0];
    safeAsync(setUploading)(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isMounted()) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/fight-camp-${camp.id}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, file, { upsert: true });

    if (!isMounted()) return;

    if (uploadError) {
      toast({ title: "Error", description: "Failed to upload image", variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);

    const { error: updateError } = await supabase
      .from("fight_camps")
      .update({ profile_pic_url: data.publicUrl })
      .eq("id", camp.id);

    if (!isMounted()) return;

    if (updateError) {
      toast({ title: "Error", description: "Failed to update profile picture", variant: "destructive" });
    } else {
      setCamp({ ...camp, profile_pic_url: data.publicUrl });
      toast({ title: "Success", description: "Profile picture updated" });
    }
    setUploading(false);
  };

  if (loading) {
    return (
      <div className="space-y-5 px-4 pb-4 pt-16 sm:p-5 sm:pt-16 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!camp) return null;

  const weightCut = camp.starting_weight_kg && camp.end_weight_kg
    ? (camp.starting_weight_kg - camp.end_weight_kg).toFixed(1)
    : null;

  return (
    <div className="space-y-5 px-4 pb-4 pt-16 sm:p-5 sm:pt-16 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fight-camps")} className="h-9 w-9 rounded-full bg-muted hover:bg-muted/80 border border-border/50 shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">{camp.name}</h1>
          <p className="text-sm text-muted-foreground">
            {camp.event_name && <span className="text-primary font-medium">{camp.event_name} &middot; </span>}
            {format(new Date(camp.fight_date), "MMM dd, yyyy")}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShareOpen(true)} className="h-9 w-9 rounded-full bg-muted hover:bg-muted/80 border border-border/50 shrink-0">
          <Share2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Hero Card — Camp Picture + Quick Stats */}
      <div className="glass-card p-4 space-y-4">
        <div className="flex items-center gap-4">
          {/* Picture */}
          <label className="relative cursor-pointer shrink-0 group">
            {camp.profile_pic_url ? (
              <img
                src={camp.profile_pic_url}
                alt={camp.name}
                className="w-20 h-20 rounded-2xl object-cover border border-border/50"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-muted/50 border border-border/50 flex items-center justify-center">
                <Trophy className="w-8 h-8 text-muted-foreground/50" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>

          {/* Quick Stats */}
          <div className="flex-1 grid grid-cols-3 gap-2">
            <div className="text-center rounded-xl bg-muted/30 dark:bg-white/5 border border-border/30 py-2.5 px-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Start</p>
              <p className="text-base font-bold display-number mt-0.5">{camp.starting_weight_kg ? `${camp.starting_weight_kg}` : '—'}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
            </div>
            <div className="text-center rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20 py-2.5 px-1">
              <p className="text-[10px] uppercase tracking-widest text-primary/70">Cut</p>
              <p className="text-base font-bold display-number text-primary mt-0.5">{weightCut ? `-${weightCut}` : '—'}<span className="text-xs font-normal text-primary/60">kg</span></p>
            </div>
            <div className="text-center rounded-xl bg-muted/30 dark:bg-white/5 border border-border/30 py-2.5 px-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">End</p>
              <p className="text-base font-bold display-number mt-0.5">{camp.end_weight_kg ? `${camp.end_weight_kg}` : '—'}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
            </div>
          </div>
        </div>

        {/* Completion Badge */}
        {camp.is_completed && (
          <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 px-3 py-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <span className="text-xs font-medium text-green-600 dark:text-green-400">Camp Completed</span>
          </div>
        )}
      </div>

      {/* Weight Cut Summary */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
          <Scale className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">Weight Cut Summary</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground pl-1">Starting Weight (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={camp.starting_weight_kg || ""}
                onChange={(e) => setCamp({ ...camp, starting_weight_kg: parseFloat(e.target.value) || null })}
                className="h-11 rounded-2xl px-4"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground pl-1">End Weight (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={camp.end_weight_kg || ""}
                onChange={(e) => setCamp({ ...camp, end_weight_kg: parseFloat(e.target.value) || null })}
                className="h-11 rounded-2xl px-4"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground pl-1">Total Weight Cut (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={camp.total_weight_cut || ""}
                onChange={(e) => setCamp({ ...camp, total_weight_cut: parseFloat(e.target.value) || null })}
                className="h-11 rounded-2xl px-4"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground pl-1">Weigh-In Timing</Label>
              <Select
                value={camp.weigh_in_timing || ""}
                onValueChange={(value: "day_before" | "day_of") => setCamp({ ...camp, weigh_in_timing: value })}
              >
                <SelectTrigger className="h-11 rounded-2xl px-4">
                  <SelectValue placeholder="Select timing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day_before">Day Before Fight</SelectItem>
                  <SelectItem value="day_of">Day of Fight</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Weight Cut Breakdown */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">Cut Breakdown</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground pl-1 flex items-center gap-1.5">
                <Droplets className="w-3 h-3 text-blue-500" />
                Via Dehydration (kg)
              </Label>
              <Input
                type="number"
                step="0.1"
                value={camp.weight_via_dehydration || ""}
                onChange={(e) => setCamp({ ...camp, weight_via_dehydration: parseFloat(e.target.value) || null })}
                className="h-11 rounded-2xl px-4"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground pl-1">Via Carb Reduction (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={camp.weight_via_carb_reduction || ""}
                onChange={(e) => setCamp({ ...camp, weight_via_carb_reduction: parseFloat(e.target.value) || null })}
                className="h-11 rounded-2xl px-4"
              />
            </div>
          </div>

          {/* Visual breakdown bar */}
          {(camp.weight_via_dehydration || camp.weight_via_carb_reduction) && (
            <div className="space-y-2 pt-1">
              <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-muted/30 border border-border/30">
                {camp.weight_via_dehydration && camp.weight_via_dehydration > 0 && (
                  <div
                    className="bg-blue-500/80 rounded-l-full transition-all duration-500"
                    style={{ width: `${(camp.weight_via_dehydration / ((camp.weight_via_dehydration || 0) + (camp.weight_via_carb_reduction || 0))) * 100}%` }}
                  />
                )}
                {camp.weight_via_carb_reduction && camp.weight_via_carb_reduction > 0 && (
                  <div
                    className="bg-primary/70 rounded-r-full transition-all duration-500"
                    style={{ width: `${(camp.weight_via_carb_reduction / ((camp.weight_via_dehydration || 0) + (camp.weight_via_carb_reduction || 0))) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500/80 inline-block" /> Dehydration</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary/70 inline-block" /> Carb Reduction</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">Rehydration Notes</h2>
        </div>
        <div className="p-4">
          <Textarea
            placeholder="How did rehydration go? What worked well? What would you change?"
            value={camp.rehydration_notes || ""}
            onChange={(e) => setCamp({ ...camp, rehydration_notes: e.target.value })}
            rows={4}
            className="rounded-2xl border-border/50 bg-muted/20 dark:bg-white/5 focus:border-primary/50 resize-none"
          />
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">Performance Feeling</h2>
        </div>
        <div className="p-4">
          <Textarea
            placeholder="How did you feel on fight day? Energy levels, strength, mental clarity?"
            value={camp.performance_feeling || ""}
            onChange={(e) => setCamp({ ...camp, performance_feeling: e.target.value })}
            rows={4}
            className="rounded-2xl border-border/50 bg-muted/20 dark:bg-white/5 focus:border-primary/50 resize-none"
          />
        </div>
      </div>

      {/* Footer — Completion + Save */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <label htmlFor="completed" className="flex items-center gap-2.5 cursor-pointer select-none">
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${camp.is_completed ? 'bg-primary border-primary' : 'border-border/60 bg-muted/20'}`}>
              {camp.is_completed && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
            </div>
            <input
              type="checkbox"
              id="completed"
              checked={camp.is_completed}
              onChange={(e) => setCamp({ ...camp, is_completed: e.target.checked })}
              className="hidden"
            />
            <span className="text-sm font-medium">Mark as completed</span>
          </label>
          <Button onClick={handleUpdate} className="rounded-2xl h-10 px-5 font-bold bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/20">
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <ShareCardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Share Camp"
        shareTitle={camp.name}
        shareText={`Check out my fight camp: ${camp.name}`}
      >
        {({ cardRef, aspect }) => (
          <FightCampSummaryCard ref={cardRef} camp={camp} aspect={aspect} />
        )}
      </ShareCardDialog>
    </div>
  );
}
