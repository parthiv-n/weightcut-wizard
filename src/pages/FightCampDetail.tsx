import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Trophy, Scale, Camera, CheckCircle2, FileText, Zap, Share2 } from "lucide-react";
import { triggerHapticSelection } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from "@/lib/logger";
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
  // Reactive Convex query — undefined while loading.
  const campRow = useQuery(
    api.fight_camp.getCamp,
    id ? { id: id as Id<"fight_camps"> } : "skip",
  );
  const updateCamp = useMutation(api.fight_camp.updateCamp);
  const generateMediaUploadUrl = useMutation(api.fight_camp.generateMediaUploadUrl);
  const getMediaUrl = useQuery; // hoisted alias to avoid TS unused-var lint
  void getMediaUrl;

  const [camp, setCamp] = useState<FightCamp | null>(null);
  const [uploading, setUploading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Project Convex row → legacy FightCamp shape so the component body stays
  // unchanged. Convex returns camelCase; the UI was built around snake_case.
  useEffect(() => {
    if (!campRow) return;
    const c: any = campRow;
    safeAsync(setCamp)({
      id: c._id,
      name: c.name,
      event_name: c.eventName ?? null,
      fight_date: c.fightDate,
      profile_pic_url: c.profilePicUrl ?? null,
      starting_weight_kg: c.startingWeightKg ?? null,
      end_weight_kg: c.endWeightKg ?? null,
      total_weight_cut: c.totalWeightCut ?? null,
      weight_via_dehydration: c.weightViaDehydration ?? null,
      weight_via_carb_reduction: c.weightViaCarbReduction ?? null,
      weigh_in_timing: c.weighInTiming ?? null,
      rehydration_notes: c.rehydrationNotes ?? null,
      performance_feeling: c.performanceFeeling ?? null,
      is_completed: c.isCompleted ?? false,
    });
  }, [campRow, safeAsync]);

  const loading = campRow === undefined && !camp;

  const handleUpdate = async () => {
    if (!camp || !id) return;
    try {
      await updateCamp({
        id: id as Id<"fight_camps">,
        startingWeightKg: camp.starting_weight_kg ?? undefined,
        endWeightKg: camp.end_weight_kg ?? undefined,
        totalWeightCut: camp.total_weight_cut ?? undefined,
        weightViaDehydration: camp.weight_via_dehydration ?? undefined,
        weightViaCarbReduction: camp.weight_via_carb_reduction ?? undefined,
        weighInTiming: camp.weigh_in_timing ?? undefined,
        rehydrationNotes: camp.rehydration_notes ?? undefined,
        performanceFeeling: camp.performance_feeling ?? undefined,
        isCompleted: camp.is_completed,
      });
      navigate("/fight-camps");
    } catch (err) {
      logger.warn("FightCampDetail: update failed", { err });
      toast({ title: "Error", description: "Failed to update camp", variant: "destructive" });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !camp) return;

    const file = e.target.files[0];

    // Basic client-side guards. Server can re-validate but we keep the user
    // from waiting on an upload that's destined to fail.
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Keep camp images under 5 MB.",
        variant: "destructive",
      });
      return;
    }
    if (file.type && !file.type.startsWith("image/")) {
      toast({
        title: "Unsupported file",
        description: "Please choose an image.",
        variant: "destructive",
      });
      return;
    }

    safeAsync(setUploading)(true);

    try {
      // 1. Generate a Convex storage upload URL, POST the bytes, resolve the
      //    long-lived public URL.
      const uploadUrl = await generateMediaUploadUrl({});
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);
      const { storageId } = (await uploadRes.json()) as { storageId: string };
      // Resolve the canonical public URL via the existing Convex query
      // module surface; we lazy-import to keep the synchronous render light.
      const { convex } = await import("@/integrations/convex/client");
      const publicUrl = (await convex.query(api.fight_camp.getMediaUrl, {
        storageId: storageId as any,
      })) as string | null;
      if (!publicUrl) throw new Error("Could not resolve uploaded image URL");

      if (!isMounted()) return;

      // 2. Persist `profilePicUrl` on the Convex fight_camps row.
      await updateCamp({
        id: camp.id as Id<"fight_camps">,
        profilePicUrl: publicUrl,
      });

      if (isMounted()) setCamp({ ...camp, profile_pic_url: publicUrl });
    } catch (err) {
      logger.error("Failed to upload fight-camp image", { err });
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      if (isMounted()) setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!camp) {
    // Convex resolved the query but found no row — id is invalid, deleted, or
    // not owned by this user. Render an explicit error card with a back
    // affordance so the user isn't staring at a blank screen.
    return (
      <div className="animate-page-in space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-2xl mx-auto">
        <div className="card-surface rounded-2xl p-6 text-center space-y-3">
          <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center mx-auto">
            <Trophy className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Camp not found</h2>
            <p className="text-muted-foreground text-xs mt-1">
              This fight camp may have been deleted or the link is invalid.
            </p>
          </div>
          <Button
            onClick={() => navigate("/fight-camps")}
            variant="outline"
            className="rounded-2xl mt-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to camps
          </Button>
        </div>
      </div>
    );
  }

  const weightCut = camp.starting_weight_kg && camp.end_weight_kg
    ? (camp.starting_weight_kg - camp.end_weight_kg).toFixed(1)
    : null;

  return (
    <div className="animate-page-in space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fight-camps")} aria-label="Back to fight camps" className="h-9 w-9 rounded-full bg-muted hover:bg-muted/80 border border-border shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">{camp.name}</h1>
          <p className="text-sm text-muted-foreground">
            {camp.event_name && <span className="text-primary font-medium">{camp.event_name} &middot; </span>}
            {format(new Date(camp.fight_date), "MMM dd, yyyy")}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShareOpen(true)} aria-label="Share camp" className="h-9 w-9 rounded-full bg-muted hover:bg-muted/80 border border-border shrink-0">
          <Share2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Hero Card — Camp Picture + Quick Stats */}
      <div className="card-surface p-3 space-y-3">
        <div className="flex items-center gap-3">
          {/* Picture */}
          <label className="relative cursor-pointer shrink-0 group">
            {camp.profile_pic_url ? (
              <img
                src={camp.profile_pic_url}
                alt={camp.name}
                className="w-16 h-16 rounded-2xl object-cover border border-border"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center">
                <Trophy className="w-6 h-6 text-muted-foreground/50" />
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
            <div className="text-center rounded-2xl bg-muted border border-border py-2.5 px-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Start</p>
              <p className="text-base font-bold display-number mt-0.5">{camp.starting_weight_kg ? `${camp.starting_weight_kg}` : '—'}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
            </div>
            <div className="text-center rounded-2xl bg-primary/10 border border-primary/20 py-2.5 px-1">
              <p className="text-[10px] uppercase tracking-widest text-primary/70">Cut</p>
              <p className="text-base font-bold display-number text-primary mt-0.5">{weightCut ? `-${weightCut}` : '—'}<span className="text-xs font-normal text-primary/60">kg</span></p>
            </div>
            <div className="text-center rounded-2xl bg-muted border border-border py-2.5 px-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">End</p>
              <p className="text-base font-bold display-number mt-0.5">{camp.end_weight_kg ? `${camp.end_weight_kg}` : '—'}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
            </div>
          </div>
        </div>

        {/* Completion Badge */}
        {camp.is_completed && (
          <div className="flex items-center gap-2 rounded-2xl bg-green-500/10 border border-green-500/20 px-3 py-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <span className="text-xs font-medium text-green-600 dark:text-green-400">Camp Completed</span>
          </div>
        )}
      </div>

      {/* Unified Weight Cut card — single piece of chrome that holds the
          before/after weights, the auto-computed total, the breakdown split,
          the proportional bar, and the weigh-in chip row. Inputs share one
          common label style (no per-row icons) so columns line up cleanly. */}
      <WeightCutCard camp={camp} setCamp={setCamp} />

      {/* Notes */}
      <div className="card-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">Rehydration Notes</h2>
        </div>
        <div className="p-4">
          <Textarea
            placeholder="How did rehydration go? What worked well? What would you change?"
            value={camp.rehydration_notes || ""}
            onChange={(e) => setCamp({ ...camp, rehydration_notes: e.target.value })}
            rows={4}
            className="rounded-2xl border-border bg-muted focus:border-primary/50 resize-none"
          />
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">Performance Feeling</h2>
        </div>
        <div className="p-4">
          <Textarea
            placeholder="How did you feel on fight day? Energy levels, strength, mental clarity?"
            value={camp.performance_feeling || ""}
            onChange={(e) => setCamp({ ...camp, performance_feeling: e.target.value })}
            rows={4}
            className="rounded-2xl border-border bg-muted focus:border-primary/50 resize-none"
          />
        </div>
      </div>

      {/* Footer — Completion + Save */}
      <div className="card-surface p-4">
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

const INPUT_CLASS =
  "h-11 rounded-2xl bg-muted/40 dark:bg-white/[0.06] border-border/30 text-[15px] text-foreground placeholder:text-muted-foreground/50 px-4 focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all text-right tabular-nums";

const LABEL_CLASS =
  "text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/70";

/**
 * Single unified weight-cut card.
 *
 * Design goals:
 *   - One piece of chrome, no nested cards.
 *   - Inputs in matched 2-col grids with identical label structure so the
 *     columns never visually shift (the old "Via Dehydration" label had a
 *     droplet icon and "Via Carb Reduction" didn't, which pushed the inputs
 *     out of alignment).
 *   - Total Weight Cut is auto-computed from Start − End and shown as a
 *     read-only badge; we still keep the underlying field in state so the
 *     existing save mutation continues to receive it.
 *   - Cut breakdown auto-fills Carb Reduction = Total − Dehydration the
 *     first time the user types in Dehydration, but a subsequent edit to
 *     Carb releases the auto-link so the user keeps full control.
 *   - Visual breakdown bar is always present; reads "Enter values below"
 *     when empty so the column heights don't jump when the user fills it.
 *   - Weigh-in is a 2-chip row matching the chip pattern used by the
 *     nutrition page, wellness check-in, and the next-camp wizard.
 */
function WeightCutCard({
  camp,
  setCamp,
}: {
  camp: FightCamp;
  setCamp: (c: FightCamp) => void;
}) {
  const [carbAuto, setCarbAuto] = useState(true);

  const start = camp.starting_weight_kg ?? null;
  const end = camp.end_weight_kg ?? null;
  const computedTotal =
    start != null && end != null && start > end
      ? Math.round((start - end) * 10) / 10
      : null;

  // Keep the persisted total_weight_cut in sync with the live Start − End so
  // downstream consumers (share cards, comparison view) get the right number
  // without an extra "save and refresh" trip.
  useEffect(() => {
    if (computedTotal !== camp.total_weight_cut) {
      setCamp({ ...camp, total_weight_cut: computedTotal });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedTotal]);

  const dehydration = camp.weight_via_dehydration;
  const carbs = camp.weight_via_carb_reduction;
  const breakdownTotal = (dehydration ?? 0) + (carbs ?? 0);
  const dehydrationPct = breakdownTotal > 0 ? ((dehydration ?? 0) / breakdownTotal) * 100 : 0;
  const carbsPct = breakdownTotal > 0 ? ((carbs ?? 0) / breakdownTotal) * 100 : 0;

  const handleStart = (v: string) => {
    const n = parseFloat(v);
    setCamp({ ...camp, starting_weight_kg: Number.isFinite(n) ? n : null });
  };
  const handleEnd = (v: string) => {
    const n = parseFloat(v);
    setCamp({ ...camp, end_weight_kg: Number.isFinite(n) ? n : null });
  };

  const handleDehydration = (v: string) => {
    const n = parseFloat(v);
    const next = Number.isFinite(n) ? n : null;
    const patch: Partial<FightCamp> = { weight_via_dehydration: next };
    if (carbAuto && computedTotal != null && next != null) {
      const auto = Math.max(0, Math.round((computedTotal - next) * 10) / 10);
      patch.weight_via_carb_reduction = auto;
    }
    setCamp({ ...camp, ...patch });
  };

  const handleCarb = (v: string) => {
    const n = parseFloat(v);
    setCarbAuto(false); // user took manual control
    setCamp({ ...camp, weight_via_carb_reduction: Number.isFinite(n) ? n : null });
  };

  const setWeighIn = (value: "day_before" | "day_of") => {
    triggerHapticSelection();
    setCamp({ ...camp, weigh_in_timing: value });
  };

  return (
    <div className="card-surface overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Scale className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold">Weight Cut</h2>
      </div>

      <div className="p-4 space-y-5">
        {/* Start + End in matched columns */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className={LABEL_CLASS}>Start (kg)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={start ?? ""}
              onChange={(e) => handleStart(e.target.value)}
              placeholder="0"
              className={INPUT_CLASS}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={LABEL_CLASS}>End (kg)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={end ?? ""}
              onChange={(e) => handleEnd(e.target.value)}
              placeholder="0"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        {/* Total — auto-computed badge */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-2xl bg-primary/10 border border-primary/20">
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-primary/80">
            Total weight cut
          </span>
          <span className="text-[15px] font-bold tabular-nums text-primary">
            {computedTotal != null ? `${computedTotal} kg` : "—"}
          </span>
        </div>

        {/* Breakdown — matched columns, identical label structure */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className={LABEL_CLASS}>Breakdown</span>
            {!carbAuto && computedTotal != null && (
              <button
                type="button"
                onClick={() => {
                  triggerHapticSelection();
                  setCarbAuto(true);
                  if (dehydration != null) {
                    const auto = Math.max(0, Math.round((computedTotal - dehydration) * 10) / 10);
                    setCamp({ ...camp, weight_via_carb_reduction: auto });
                  }
                }}
                className="text-[10px] font-semibold text-primary/80 active:text-primary uppercase tracking-wider"
              >
                Reset auto
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={LABEL_CLASS}>Dehydration</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={dehydration ?? ""}
                onChange={(e) => handleDehydration(e.target.value)}
                placeholder="kg"
                className={INPUT_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={LABEL_CLASS}>Carb reduction</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={carbs ?? ""}
                onChange={(e) => handleCarb(e.target.value)}
                placeholder={carbAuto && computedTotal != null && dehydration != null ? "auto" : "kg"}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Proportional bar — always present so heights don't jump */}
          <div className="space-y-1.5">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-muted/40 border border-border/40">
              {breakdownTotal > 0 ? (
                <>
                  <div
                    className="bg-blue-500/85 transition-all duration-500"
                    style={{ width: `${dehydrationPct}%` }}
                  />
                  <div
                    className="bg-primary/80 transition-all duration-500"
                    style={{ width: `${carbsPct}%` }}
                  />
                </>
              ) : (
                <div className="flex-1 bg-muted-foreground/10" />
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/80">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500/85" />
                Dehydration
                {breakdownTotal > 0 && (
                  <span className="tabular-nums ml-0.5 text-muted-foreground/60">
                    {Math.round(dehydrationPct)}%
                  </span>
                )}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-primary/80" />
                Carb reduction
                {breakdownTotal > 0 && (
                  <span className="tabular-nums ml-0.5 text-muted-foreground/60">
                    {Math.round(carbsPct)}%
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Weigh-in — two-chip row matches the rest of the app */}
        <div className="space-y-1.5">
          <Label className={LABEL_CLASS}>Weigh-in timing</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["day_before", "day_of"] as const).map((value) => {
              const active = camp.weigh_in_timing === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWeighIn(value)}
                  aria-pressed={active}
                  className={`h-11 rounded-2xl text-[13px] font-semibold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/40 text-muted-foreground/85 active:bg-muted/60 border border-border/30"
                  }`}
                >
                  {value === "day_before" ? "Day before" : "Day of"}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
