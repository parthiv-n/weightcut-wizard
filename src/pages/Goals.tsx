import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Target } from "lucide-react";
import { profileSchema } from "@/lib/validation";
import { useUser } from "@/contexts/UserContext";
import { celebrateSuccess, triggerHapticSelection } from "@/lib/haptics";
import { GoalsSkeleton } from "@/components/ui/skeleton-loader";
import { SwipeDial } from "@/components/ui/SwipeDial";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

const ATHLETE_TYPES: Record<string, string> = {
  mma: "MMA", boxing: "Boxing", muay_thai: "Muay Thai", bjj: "BJJ",
  wrestling: "Wrestling", kickboxing: "Kickboxing", judo: "Judo",
  karate: "Karate", other: "Other",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Beginner", amateur: "Amateur Fighter", pro: "Experienced / Pro",
};

const AGGRESSIVENESS_LABELS: Record<string, string> = {
  conservative: "Conservative", balanced: "Balanced", aggressive: "Aggressive",
};

export default function Goals() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    userId,
    currentWeight,
    profile: contextProfile,
    refreshProfile,
    userName,
    setUserName,
    avatarUrl,
    setAvatarUrl,
  } = useUser();
  const updateGoals = useMutation(api.profiles.updateGoals);
  const setUserNameMut = useMutation(api.profiles.setUserName);

  // Local mirror of the editable display name. Kept separate from the
  // context value so typing doesn't immediately mutate the cache, then
  // flushed via `setUserNameMut` on blur (mirrors the Settings panel).
  const [editedName, setEditedName] = useState<string>(userName ?? "");
  const [savingName, setSavingName] = useState(false);
  useEffect(() => { setEditedName(userName ?? ""); }, [userName]);

  const flushName = async () => {
    const next = editedName.trim();
    if (!userId || !next || next === userName) return;
    setSavingName(true);
    try {
      await setUserNameMut({ displayName: next });
      setUserName(next);
    } catch (err) {
      // The mutation also runs from UserContext.setUserName as a side-
      // effect; surfacing here would double-toast. Just log and move on.
      console.warn("Goals: setUserName failed", err);
    } finally {
      setSavingName(false);
    }
  };

  const [formData, setFormData] = useState({
    age: "",
    sex: "",
    height_cm: "",
    current_weight_kg: "",
    goal_weight_kg: "",
    fight_week_target_kg: "",
    target_date: "",
    activity_level: "",
    training_frequency: "",
    // New onboarding v2 fields
    athlete_type: "",
    goal_type: "",
    experience_level: "",
    training_types: [] as string[],
    sleep_hours: "",
    primary_struggle: "",
    plan_aggressiveness: "",
    body_fat_pct: "",
  });

  const [useAutoTarget, setUseAutoTarget] = useState(true);
  const [targetSafetyLevel, setTargetSafetyLevel] = useState<"safe" | "moderate" | "risky">("safe");

  useEffect(() => {
    if (!userId) { navigate("/auth"); return; }
    if (contextProfile) {
      const currentWeightValue = currentWeight ?? contextProfile.current_weight_kg ?? 0;
      const p = contextProfile as any;
      setFormData({
        age: contextProfile.age?.toString() || "",
        sex: contextProfile.sex || "",
        height_cm: contextProfile.height_cm?.toString() || "",
        current_weight_kg: currentWeightValue.toString(),
        goal_weight_kg: contextProfile.goal_weight_kg?.toString() || "",
        fight_week_target_kg: contextProfile.fight_week_target_kg?.toString() || "",
        target_date: contextProfile.target_date || "",
        activity_level: contextProfile.activity_level || "",
        training_frequency: contextProfile.training_frequency?.toString() || "",
        athlete_type: p.athlete_type || "",
        goal_type: p.goal_type || "cutting",
        experience_level: p.experience_level || "",
        training_types: p.training_types || [],
        sleep_hours: p.sleep_hours || "",
        primary_struggle: p.primary_struggle || "",
        plan_aggressiveness: p.plan_aggressiveness || "",
        body_fat_pct: p.body_fat_pct?.toString() || "",
      });

      if (contextProfile.goal_weight_kg && contextProfile.fight_week_target_kg) {
        const recommended = calculateRecommendedTarget(contextProfile.goal_weight_kg);
        setUseAutoTarget(Math.abs(contextProfile.fight_week_target_kg - recommended) < 0.1);
      }
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [userId, contextProfile]);

  const calculateBMR = () => {
    const weight = parseFloat(formData.current_weight_kg) || 70;
    const height = parseFloat(formData.height_cm) || 175;
    const age = parseInt(formData.age) || 25;
    return formData.sex === "male"
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;
  };

  const calculateRecommendedTarget = (fightNightWeight: number) => {
    return Math.round(fightNightWeight * 1.055 * 10) / 10;
  };

  const assessTargetSafety = (fightNightWeight: number, fightWeekTarget: number) => {
    const cutPercentage = ((fightWeekTarget - fightNightWeight) / fightNightWeight) * 100;
    if (cutPercentage <= 5) return { level: "safe" as const, message: "Safe range (≤5%)" };
    if (cutPercentage <= 7) return { level: "moderate" as const, message: "Moderate risk (5-7%)" };
    return { level: "risky" as const, message: "High risk (>7%)" };
  };

  useEffect(() => {
    if (useAutoTarget && formData.goal_weight_kg) {
      const rec = calculateRecommendedTarget(parseFloat(formData.goal_weight_kg));
      setFormData(prev => ({ ...prev, fight_week_target_kg: rec.toString() }));
      setTargetSafetyLevel("safe");
    }
  }, [formData.goal_weight_kg, useAutoTarget]);

  useEffect(() => {
    if (!useAutoTarget && formData.goal_weight_kg && formData.fight_week_target_kg) {
      setTargetSafetyLevel(assessTargetSafety(parseFloat(formData.goal_weight_kg), parseFloat(formData.fight_week_target_kg)).level);
    }
  }, [formData.fight_week_target_kg, formData.goal_weight_kg, useAutoTarget]);

  const handleSubmit = async () => {
    const goalType = formData.goal_type || 'cutting';
    const validationResult = profileSchema.safeParse({
      age: parseInt(formData.age),
      height_cm: parseFloat(formData.height_cm),
      current_weight_kg: parseFloat(formData.current_weight_kg),
      goal_weight_kg: parseFloat(formData.goal_weight_kg),
      fight_week_target_kg: goalType === 'cutting' ? parseFloat(formData.fight_week_target_kg) : undefined,
      training_frequency: parseInt(formData.training_frequency),
    });

    if (!validationResult.success) {
      toast({ variant: "destructive", title: "Validation Error", description: validationResult.error.errors[0].message });
      return;
    }

    setSaving(true);
    try {
      if (!userId) throw new Error("No user found");
      const bmr = calculateBMR();
      const tdee = bmr * (ACTIVITY_MULTIPLIERS[formData.activity_level as keyof typeof ACTIVITY_MULTIPLIERS] ?? 1.55);

      await updateGoals({
        age: parseInt(formData.age),
        sex: formData.sex,
        heightCm: parseFloat(formData.height_cm),
        currentWeightKg: parseFloat(formData.current_weight_kg),
        goalWeightKg: parseFloat(formData.goal_weight_kg),
        fightWeekTargetKg: goalType === 'cutting' ? parseFloat(formData.fight_week_target_kg) : undefined,
        targetDate: formData.target_date,
        activityLevel: formData.activity_level,
        trainingFrequency: parseInt(formData.training_frequency),
        bmr,
        tdee,
        athleteType: formData.athlete_type || undefined,
        goalType: formData.goal_type || undefined,
        experienceLevel: formData.experience_level || undefined,
        trainingTypes: formData.training_types.length > 0 ? formData.training_types : undefined,
        sleepHours: formData.sleep_hours || undefined,
        primaryStruggle: formData.primary_struggle || undefined,
        planAggressiveness: formData.plan_aggressiveness || undefined,
        bodyFatPct: formData.body_fat_pct ? parseFloat(formData.body_fat_pct) : undefined,
      });
      await refreshProfile();
      celebrateSuccess();
      navigate("/dashboard");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GoalsSkeleton />;

  const isFighter = formData.goal_type === "cutting";
  const safetyFeedback = formData.goal_weight_kg && formData.fight_week_target_kg
    ? assessTargetSafety(parseFloat(formData.goal_weight_kg), parseFloat(formData.fight_week_target_kg))
    : null;

  // Multi-select sport list — kept as a comma-separated string in the
  // DB column to avoid a schema migration. The UI uses a single primary
  // sport via the SwipeDial; if the user previously selected multiple,
  // we honour the first as the active one and keep the rest in storage.
  const selectedSports = formData.athlete_type
    ? formData.athlete_type.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const primarySport = selectedSports[0] ?? "";
  const setPrimarySport = (v: string) => {
    setFormData((prev) => ({ ...prev, athlete_type: v }));
  };

  return (
    <div className="animate-page-in space-y-3 px-5 py-3 sm:p-5 max-w-2xl mx-auto pb-20 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-[12px]">Tap to edit</p>
      </div>

      {!contextProfile?.goal_weight_kg && (
        <div className="rounded-2xl bg-primary/5 border border-primary/15 p-3 flex items-start gap-2">
          <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-[13px] text-foreground/80 leading-snug">
            Finish your profile so the Wizard can calculate targets and guide your cut.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {/* ── Profile (top) ──────────────────────────────────────────── */}
        {/* Picture + display name. Moved here from the Settings panel so
            the most personal fields live with the rest of the profile. */}
        <Section title="You">
          <div className="flex items-center gap-3 px-3 py-3">
            <ProfilePictureUpload
              currentAvatarUrl={avatarUrl}
              onUploadSuccess={(url) => setAvatarUrl(url)}
              size="lg"
              showRemove={false}
            />
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Display name
              </Label>
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={() => void flushName()}
                placeholder="Your name"
                className="mt-1 h-10 rounded-xl bg-muted/40 border-border/30 text-[15px]"
                disabled={savingName}
              />
            </div>
          </div>
        </Section>

        {/* ── Personal Details (above Athlete Profile) ───────────────── */}
        <Section title="Personal Details">
          <Row label="Age">
            <NumericInput
              value={formData.age}
              onChange={(v) => setFormData((p) => ({ ...p, age: v }))}
            />
          </Row>
          <Row label="Sex">
            <SegmentedTwo
              value={formData.sex}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
              ]}
              onChange={(v) => setFormData((p) => ({ ...p, sex: v }))}
            />
          </Row>
          <Row label="Height">
            <NumericInput
              value={formData.height_cm}
              onChange={(v) => setFormData((p) => ({ ...p, height_cm: v }))}
              suffix="cm"
            />
          </Row>
          <Row label="Weight">
            <NumericInput
              step="0.1"
              value={formData.current_weight_kg}
              onChange={(v) => setFormData((p) => ({ ...p, current_weight_kg: v }))}
              suffix="kg"
            />
          </Row>
          {formData.body_fat_pct !== undefined && (
            <Row label="Body Fat">
              <NumericInput
                step="0.1"
                value={formData.body_fat_pct}
                onChange={(v) => setFormData((p) => ({ ...p, body_fat_pct: v }))}
                suffix="%"
              />
            </Row>
          )}
          <DialRow label="Sleep">
            <SwipeDial
              value={formData.sleep_hours}
              cellWidth={88}
              ariaLabel="Sleep hours per night"
              options={[
                { value: "<5", label: "<5h" },
                { value: "5-6", label: "5–6h" },
                { value: "6-7", label: "6–7h" },
                { value: "7-8", label: "7–8h" },
                { value: "8+", label: "8h+" },
              ]}
              onChange={(v) => setFormData((p) => ({ ...p, sleep_hours: v }))}
            />
          </DialRow>
        </Section>

        {/* ── Targets (below Personal Details) ──────────────────────── */}
        <Section title="Targets">
          <Row label={isFighter ? "Weight Class" : "Goal Weight"}>
            <NumericInput
              step="0.1"
              value={formData.goal_weight_kg}
              onChange={(v) => setFormData((p) => ({ ...p, goal_weight_kg: v }))}
              suffix="kg"
              accent
            />
          </Row>

          {isFighter && (
            <div className="px-3 py-2.5 bg-muted/15 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Label className="text-[14px] font-medium truncate">Diet Target</Label>
                  <button
                    type="button"
                    onClick={() => setUseAutoTarget(!useAutoTarget)}
                    className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0 transition-colors ${
                      useAutoTarget
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {useAutoTarget ? "Auto" : "Manual"}
                  </button>
                </div>
                <NumericInput
                  step="0.1"
                  value={formData.fight_week_target_kg}
                  onChange={(v) => {
                    setFormData((p) => ({ ...p, fight_week_target_kg: v }));
                    setUseAutoTarget(false);
                  }}
                  suffix="kg"
                  disabled={useAutoTarget}
                />
              </div>
              {useAutoTarget ? (
                <p className="text-[12px] text-muted-foreground leading-snug">
                  Safe pre-cut weight (5.5% buffer)
                </p>
              ) : (
                safetyFeedback && (
                  <div
                    className={`flex items-center gap-1.5 text-[12px] font-medium leading-snug ${
                      targetSafetyLevel === "safe"
                        ? "text-emerald-500"
                        : targetSafetyLevel === "moderate"
                        ? "text-amber-500"
                        : "text-rose-500"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{safetyFeedback.message}</span>
                  </div>
                )
              )}
            </div>
          )}

          <Row label="Target Date">
            <Input
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData((p) => ({ ...p, target_date: e.target.value }))}
              className="w-auto h-7 border-transparent focus-visible:ring-0 bg-transparent p-0 text-[14px] text-right"
            />
          </Row>
        </Section>

        {/* ── Activity & Training (below Targets) ────────────────────── */}
        <Section title="Activity & Training">
          <DialRow label="Activity Level">
            <SwipeDial
              value={formData.activity_level}
              cellWidth={120}
              ariaLabel="Daily activity level"
              options={[
                { value: "sedentary", label: "Sedentary" },
                { value: "lightly_active", label: "Light" },
                { value: "moderately_active", label: "Moderate" },
                { value: "very_active", label: "Active" },
                { value: "extra_active", label: "Extreme" },
              ]}
              onChange={(v) => setFormData((p) => ({ ...p, activity_level: v }))}
            />
          </DialRow>
          <Row label="Training">
            <NumericInput
              value={formData.training_frequency}
              onChange={(v) => setFormData((p) => ({ ...p, training_frequency: v }))}
              suffix="/wk"
            />
          </Row>
        </Section>

        {/* ── Athlete Profile (bottom) — swipe dials replace the chip
              grids that used to dominate the page ────────────────────── */}
        <Section title="Athlete Profile">
          <DialRow label="Sport">
            <SwipeDial
              value={primarySport}
              cellWidth={100}
              ariaLabel="Primary sport"
              options={Object.entries(ATHLETE_TYPES).map(([k, v]) => ({
                value: k,
                label: v,
              }))}
              onChange={(v) => setPrimarySport(v)}
            />
          </DialRow>
          <DialRow label="Goal">
            <SwipeDial
              value={formData.goal_type}
              cellWidth={120}
              ariaLabel="Primary goal"
              options={[
                { value: "cutting", label: "Cut" },
                { value: "losing", label: "Lose" },
                { value: "maintaining", label: "Maintain" },
                { value: "gaining", label: "Gain" },
              ]}
              onChange={(v) => setFormData((p) => ({ ...p, goal_type: v }))}
            />
          </DialRow>
          <DialRow label="Experience">
            <SwipeDial
              value={formData.experience_level}
              cellWidth={150}
              ariaLabel="Experience level"
              options={Object.entries(EXPERIENCE_LABELS).map(([k, v]) => ({
                value: k,
                label: v,
              }))}
              onChange={(v) => setFormData((p) => ({ ...p, experience_level: v }))}
            />
          </DialRow>
          <DialRow label="Plan Style">
            <SwipeDial
              value={formData.plan_aggressiveness}
              cellWidth={130}
              ariaLabel="Plan aggressiveness"
              options={Object.entries(AGGRESSIVENESS_LABELS).map(([k, v]) => ({
                value: k,
                label: v,
              }))}
              onChange={(v) => setFormData((p) => ({ ...p, plan_aggressiveness: v }))}
            />
          </DialRow>
        </Section>

        {/* Save */}
        <div className="pt-2 pb-4">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-12 rounded-2xl text-[15px] font-semibold text-primary-foreground bg-primary active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Layout primitives — kept inline so the page reads top-to-bottom and
// each row's structure is obvious without jumping files. They share one
// styling vocabulary so the page reads as a single coherent settings
// surface rather than a stack of bespoke cards.
// ──────────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-surface rounded-2xl border border-border overflow-hidden">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 px-3 pt-3 pb-2">
        {title}
      </h2>
      <div className="divide-y divide-border/40 border-t border-border/40">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 min-h-[44px]">
      <Label className="text-[14px] font-medium truncate">{label}</Label>
      <div className="flex items-center gap-0.5 max-w-[60%] justify-end">
        {children}
      </div>
    </div>
  );
}

function DialRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2.5 space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function NumericInput({
  value,
  onChange,
  suffix,
  step,
  disabled,
  accent,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  step?: string;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-16 text-right h-8 border-transparent focus-visible:ring-0 bg-transparent p-0 text-[15px] tabular-nums disabled:opacity-60 ${
          accent ? "font-semibold text-primary" : ""
        }`}
        placeholder="–"
        inputMode="decimal"
      />
      {suffix && (
        <span className="text-muted-foreground text-[13px] tabular-nums">
          {suffix}
        </span>
      )}
    </>
  );
}

function SegmentedTwo({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-muted/30 rounded-xl p-0.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              triggerHapticSelection();
              onChange(o.value);
            }}
            className={`min-w-[60px] h-8 px-3 rounded-lg text-[13px] font-medium transition-all ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
