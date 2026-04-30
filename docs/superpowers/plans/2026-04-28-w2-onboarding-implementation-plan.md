# W2 — Onboarding Orchestrator Implementation Plan

**Date:** 2026-04-28
**Branch:** `coach-mode`
**Spec:** `docs/superpowers/specs/2026-04-28-ai-features-overhaul-design.md` §4–§5
**Status:** Plan only — implementer agent to execute.

---

## 0. Context the implementer must hold in head

W1 already shipped the foundation: typed profile columns (sport, sanctioning_body, weight_class_kg, walking_weight_kg, experience, stance, imperial_units, current_fight_camp_id …), `fight_camps.is_active` + the unique partial index, science anchors, camp phase machine, and the new step components. The 7 step components in `src/components/onboarding/steps/` are already built and wired against `OnboardingFormData` (see `types.ts`). What is **missing** is the orchestrator that drives them. The current `src/pages/Onboarding.tsx` (1369 lines) is the legacy 15-step flow and will be **replaced wholesale** by a thin orchestrator under 350 lines.

---

## 1. Orchestrator architecture (`src/pages/Onboarding.tsx`)

Hard target: **<350 LOC** including imports + JSX. If creep happens, factor sub-flow logic into `src/components/onboarding/useOnboardingFlow.ts` (a hook returning `{step, substep, formData, setForm, onNext, onBack, …}`); do NOT factor each step into its own page.

### 1.1 State

- `const [form, setForm] = useState<OnboardingFormData>(INITIAL_FORM_DATA);` — single source of truth, comes from `src/components/onboarding/types.ts:51`.
- `const [step, setStep] = useState<number>(1);` — 1..7.
- `const [substep, setSubstep] = useState<"a"|"b"|"c">("a");` — only used while `step === 3`. The Step3 component itself does not currently know about substeps; the orchestrator **slices the rendered Step3 view** by substep. See §4 below for the mapping.
- `const [direction, setDirection] = useState<1|-1>(1);` — drives `motion/react` slide direction (mirror current Onboarding.tsx:147).
- `const [preview, setPreview] = useState<PlanPreview>({ loading: false });` — passed to Step7. Shape lives in `src/components/onboarding/steps/Step7Preview.tsx:10-17`.
- `const [submitting, setSubmitting] = useState(false);` — drives Step7 button spinner.

Hooks consumed: `useNavigate`, `useAuth`, `useProfile` (`refreshProfile`, `profile`), `useToast`, `triggerHapticSelection`/`celebrateSuccess` from `@/lib/haptics`.

### 1.2 Branching rule

`const isFighter = form.goal_type === "cutting";`

- Fighters traverse: 1 → 2 → 3a → 3b → 3c → 4 → 5 → 6 → 7.
- Losers traverse: 1 → **skip 2** → 3a → 3b → 3c → 4 → 5 → 6 → 7.
- The displayed `Step X of 7` label stays as the natural step number (not adjusted for losers — spec §5.1 keeps the count consistent and shows progress as `step/TOTAL_STEPS`).

In `goNext` from step 1: if `goal_type==="losing"`, set `step = 3; substep = "a"`. Going *back* from step 3a as a loser jumps to step 1 (skip step 2 again).

### 1.3 `onNext` per step (single function dispatching by step+substep)

Pseudocode (orchestrator-internal):

1. Run validators for current `(step, substep)`. If invalid: `toast({variant:"destructive", description:"…"})` and return early. **No silent defaults** for `age`/`sex` (legacy Onboarding.tsx:308–313).
2. Persist progress via `persistProgress(nextStep)` — see §1.4.
3. `triggerHapticSelection()`.
4. Advance: compute `nextStep`/`nextSubstep`, set state, set direction `+1`.

Validators live inline in the orchestrator (each ≤6 lines). Required-field rules:

| Step / Substep | Required (block continue) |
|---|---|
| 1 | `goal_type !== ""`; if cutting also `sport !== ""` |
| 2 (fighter) | `sanctioning_body !== ""`; `fight_date` and `weight_class_kg` recommended (Step2 currently does NOT block — keep that, see §4) |
| 3a (Name) | `display_name.trim().length >= 1` |
| 3b (Body) | `sex !== ""` && `age` is a number ≥13 ≤80 && height_cm ≥100 ≤230 && walking_weight_kg present && current_weight_kg present; for losers also `goal_weight_kg` and `target_weeks` |
| 3c (Cycle, F-only) | nothing required — pass-through if not female |
| 4 | `experience !== ""` && `training_frequency` parseable ≥0 ≤14 && (fighter ⇒ `stance !== ""`) |
| 5 | nothing — Skip allowed |
| 6 | nothing — Skip allowed |
| 7 | edited_calories ≥1200 (F) or ≥1500 (M); edited_protein_g ≥1.2 g/kg of `current_weight_kg` |

### 1.4 `persistProgress(targetStep: number)`

Writes the row each time the user advances so a hard-close mid-flow resumes correctly (§2). Implementation:

```ts
async function persistProgress(targetStep: number) {
  if (!userId) return;
  const partial = buildProfilePartial(form);
  partial.onboarding_step = targetStep;
  await supabase.from("profiles").upsert({ id: userId, ...partial }, { onConflict: "id" });
}
```

`buildProfilePartial(form)` is a small helper at the bottom of the file (≤40 LOC). It maps form → DB column names, dropping empty strings (`null` instead) and converting numerics. Mirrors the legacy Onboarding submit (Onboarding.tsx:346–378) but writes the typed W1 columns: `sport`, `sanctioning_body`, `weight_class_kg`, `weighin_to_bout_hours`, `walking_weight_kg`, `experience`, `stance`, `imperial_units`, `menstrual_tracking_enabled`, `display_name`, `goal_type`, `target_date` (only set on step 2 for fighters, or derived from `target_weeks` for losers at step 7), and the legacy fields still consumed elsewhere (`age`, `sex`, `height_cm`, `current_weight_kg`, `goal_weight_kg`, `training_frequency`, `activity_level`, `bmr`, `tdee`, `food_budget`, `experience_level=experience` for backward-compat — see §10).

The upsert is incremental: only fields the user has actually filled get written; everything else is left untouched in DB.

### 1.5 Plan-generation kickoff (between step 6 and step 7)

When `onNext` is called from step 6 (or skip), set `preview.loading = true` and fire-and-forget the appropriate edge function in parallel with the step transition. The user sees Step 7 "Generating your plan…" (Step7Preview.tsx:78–82 already renders this). On resolve/error, update `preview` state.

```ts
async function kickOffPlanGeneration() {
  setPreview({ loading: true });
  const fnName = form.goal_type === "cutting" ? "generate-cut-plan" : "generate-weight-plan";
  const body = buildPlanRequestBody(form);  // see §5
  try {
    const { data, error } = await supabase.functions.invoke(fnName, { body });
    if (error) throw error;
    const plan = data?.plan ?? data;
    if (!plan?.weeklyPlan) throw new Error("Plan missing weeklyPlan");
    setPreview({
      loading: false,
      calories: plan.weeklyPlan[0]?.calories,
      protein_g: plan.weeklyPlan[0]?.protein_g,
      carbs_g: plan.weeklyPlan[0]?.carbs_g,
      fats_g: plan.weeklyPlan[0]?.fats_g,
    });
    // Stash the full plan for §1.6 final write.
    planRef.current = plan;
  } catch (err) {
    logger.warn(`${fnName} failed`, { err });
    setPreview({ loading: false, error: String(err) });
  }
}
```

`planRef = useRef<any>(null)` holds the plan between Step 7 render and final submit so we don't re-call the LLM if the user only edits calories.

### 1.6 Final submit on Step 7 "Start camp"

```ts
async function handleFinalSubmit() {
  if (!validateStep7()) return;
  setSubmitting(true);
  try {
    // 1. Write full profile row (last upsert with onboarding_completed_at).
    const partial = buildProfilePartial(form);
    partial.onboarding_step = 7;
    partial.onboarding_completed_at = new Date().toISOString();
    partial.cut_plan_json = planRef.current ?? null;
    if (planRef.current?.weeklyPlan?.[0]) {
      const w1 = planRef.current.weeklyPlan[0];
      partial.ai_recommended_calories = parseInt(form.edited_calories) || w1.calories;
      partial.ai_recommended_protein_g = parseInt(form.edited_protein_g) || w1.protein_g;
      partial.ai_recommended_carbs_g = w1.carbs_g;
      partial.ai_recommended_fats_g = w1.fats_g;
    }
    await supabase.from("profiles").upsert({ id: userId, ...partial }, { onConflict: "id" });

    // 2. Fighter: create active fight_camp + link.
    if (isFighter && form.fight_date) {
      const { data: camp } = await supabase
        .from("fight_camps")
        .insert({
          user_id: userId,
          name: `${form.sanctioning_body || "Camp"} ${form.fight_date}`,
          fight_date: form.fight_date,
          starting_weight_kg: parseFloat(form.current_weight_kg) || null,
          is_active: true,
        })
        .select("id")
        .single();
      if (camp?.id) {
        await supabase.from("profiles").update({ current_fight_camp_id: camp.id }).eq("id", userId);
      }
    }

    // 3. Persist notification prefs (jsonb column added in §3).
    await supabase.from("profiles").update({
      notification_prefs: {
        weighin: form.notif_weighin,
        daily_checkin: form.notif_daily_checkin,
        weighin_week_morning: form.notif_weighin_week_morning,
        hydration: form.notif_hydration,
      },
    }).eq("id", userId);

    // 4. D1 retention notification — see §7.
    await scheduleD1MorningWeighIn();

    // 5. Refresh context + navigate.
    await refreshProfile();
    celebrateSuccess();
    localStorage.setItem("wcw_onboarding_just_completed", "true");
    navigate("/dashboard", { replace: true });
  } catch (err) {
    logger.error("Onboarding submit failed", err);
    toast({ variant: "destructive", title: "Couldn't save your plan", description: "Try again — your progress is saved." });
  } finally {
    setSubmitting(false);
  }
}
```

---

## 2. Resume-from-mid-flow

### 2.1 Cold-start seeding

In an effect that runs once `profile` is non-null:

```ts
useEffect(() => {
  if (!profile || hydratedRef.current) return;
  hydratedRef.current = true;
  // Seed the form from existing typed columns so the user re-enters mid-flow
  // with values already filled.
  setForm(prev => mergeProfileIntoForm(prev, profile));
  const resumeStep = (profile as any).onboarding_step ?? 1;
  if (resumeStep >= 1 && resumeStep <= 7) {
    setStep(resumeStep);
    setSubstep("a"); // resuming Step 3 always starts at 3a
  }
}, [profile]);
```

`mergeProfileIntoForm(form, profile)` is a small helper (≤30 LOC) that copies known typed columns back into the form.

### 2.2 Guard interaction

`ProfileCompletionGuard` (`src/components/ProfileCompletionGuard.tsx:14`) currently redirects to `/onboarding` whenever `!hasProfile`. After this work it must redirect on `!profile?.onboarding_completed_at` instead — change the line to `if (!profile?.onboarding_completed_at) return <Navigate to="/onboarding" replace />;`. This makes mid-flow rows (which DO satisfy `hasProfile=true` because the upsert created the row) still redirect back to `/onboarding` until step 7 succeeds. Confirm `useAuth().hasProfile` continues to be set true on partial rows — yes, because the cold-start query in `UserContext._performLoad` sets `hasProfile = !!profileData` (UserContext.tsx:393).

### 2.3 Edge cases the implementer should handle

- A row that has `onboarding_completed_at` set but the user hits `/onboarding` directly (e.g. via deep link): early-return `<Navigate to="/dashboard" replace />` (mirror Onboarding.tsx:200–207).
- A coach landing on `/onboarding`: existing `isCoach` redirect to `/coach` (Onboarding.tsx:202) stays.

---

## 3. DB migration follow-up SQL

New file: `supabase/migrations/20260429100000_w2_onboarding_columns.sql` (use the next free ts after the existing 20260429050000 — confirm with `ls -la supabase/migrations/` before naming).

```sql
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivation_note text,
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{}'::jsonb;

-- display_name already exists (migration 20260427040000_profile_display_name.sql).
-- Do NOT re-create. The implementer must `grep -n "display_name" supabase/migrations/*.sql`
-- before adding to confirm.

-- Mark all existing fully-onboarded users complete so the guard doesn't
-- re-bounce them through the new flow.
UPDATE public.profiles
SET onboarding_completed_at = COALESCE(onboarding_completed_at, created_at, NOW()),
    onboarding_step = 7
WHERE current_weight_kg IS NOT NULL
  AND (sex IS NOT NULL OR age IS NOT NULL);

NOTIFY pgrst, 'reload schema';

COMMIT;
```

After the migration, extend `src/lib/queryColumns.ts:1` `PROFILE_COLUMNS` with `onboarding_step`, `onboarding_completed_at`, `motivation_note`, `notification_prefs`. Extend `ProfileData` in `src/contexts/UserContext.tsx:14-62` with the same.

---

## 4. Step-component wiring contract (verified against actual files)

Each component already exports a named function. Required props match what the orchestrator must pass:

| Component | File | Props (verified) |
|---|---|---|
| Step1Goal | `steps/Step1Goal.tsx:22-32` | `form`, `setForm`, `onNext`, `showMotivationPrompt: boolean` |
| Step2FightSetup | `steps/Step2FightSetup.tsx:29-39` | `form`, `setForm`, `onNext`, `onSkip` |
| Step3About | `steps/Step3About.tsx:43-51` | `form`, `setForm`, `onNext` |
| Step4Experience | `steps/Step4Experience.tsx:26-34` | `form`, `setForm`, `onNext` |
| Step5Constraints | `steps/Step5Constraints.tsx:25-35` | `form`, `setForm`, `onNext`, `onSkip` |
| Step6Notifications | `steps/Step6Notifications.tsx:46-56` | `form`, `setForm`, `onNext`, `onSkip` |
| Step7Preview | `steps/Step7Preview.tsx:19-31` | `form`, `setForm`, `onSubmit`, `preview: PlanPreview`, `loading: boolean` |

**Substep handling for Step 3.** Step3About is currently a single screen (Step3About.tsx:74–362) showing every field at once. The spec says 3a/3b/3c. The implementer has two options; pick **Option A** (no component change):

- **Option A (recommended, ship-this-PR):** Keep Step3About monolithic; the orchestrator just renders it three times in a row but with a `substep` prop the orchestrator passes. **Required component change**: extend Step3About props to accept `substep?: "a"|"b"|"c"` and conditionally render: `a` → display_name only; `b` → sex/age/height/weights/goal_weight/target_weeks; `c` → menstrual toggle (skip when `sex!=="female"`). This is a ~30-line diff, not a refactor.
- **Option B (defer):** keep Step3About as one screen, drop substep tracking. Does NOT meet spec §5.1 — **do not pick.**

Helper functions in `src/components/onboarding/types.ts` actually consumed by step components and the orchestrator:

| Helper | File:Line | Consumed by |
|---|---|---|
| `INITIAL_FORM_DATA` | types.ts:51 | orchestrator |
| `calculateBMR(form)` | types.ts:103 | Step7Preview.tsx:34 |
| `deriveActivityLevel(freq)` | types.ts:94 | Step7Preview.tsx:35; orchestrator (`buildPlanRequestBody`) |
| `ACTIVITY_MULTIPLIERS` | types.ts:112 | Step7Preview.tsx:35; orchestrator |
| `suggestWeightClassKg(body, kg)` | types.ts:142 | Step2FightSetup.tsx:9 |
| `defaultTrainingTypesForSport(sport)` | types.ts:163 | NOT yet wired — orchestrator should call this **once** when `goal_type` flips to "cutting" or `sport` changes, to pre-fill `form.training_types` if empty |

`PlanPreview` type lives in `Step7Preview.tsx:10-17` — orchestrator imports `type {PlanPreview}` from there.

No prop mismatches were found.

---

## 5. Plan-generation API contracts

### 5.1 `generate-cut-plan` (fighters)

Current request body shape (verified from `supabase/functions/generate-cut-plan/index.ts:62-68`):

| Field | Type | Source from form |
|---|---|---|
| `currentWeight` | number | `parseFloat(form.current_weight_kg)` |
| `goalWeight` | number | `parseFloat(form.weight_class_kg)` (W1 maps "goal" to weight class for fighters) |
| `fightWeekTarget` | number | `parseFloat(form.weight_class_kg) * 1.055` (apply 5.5% water-cut buffer until user customises) |
| `targetDate` | string (ISO date) | `form.fight_date` |
| `age` | number | `parseInt(form.age)` |
| `sex` | "male" \| "female" | `form.sex` |
| `heightCm` | number | `parseFloat(form.height_cm)` |
| `activityLevel` | string | `deriveActivityLevel(form.training_frequency)` |
| `trainingFrequency` | number | `parseInt(form.training_frequency)` |
| `bmr` | number | `calculateBMR(form)` |
| `tdee` | number | `bmr * ACTIVITY_MULTIPLIERS[activityLevel]` |
| `sport` | Sport | `form.sport` |
| `sanctioningBody` | SanctioningBody | `form.sanctioning_body` |
| `weightClassKg` | number | `parseFloat(form.weight_class_kg)` |
| `walkingWeightKg` | number | `parseFloat(form.walking_weight_kg)` |
| `experience` | ExperienceLevel | `form.experience` |

Response: `{ plan: { weeklyPlan: [...], summary, totalWeeks, weeklyLossTarget, deficit, riskLevel, recommendation, fightWeek, keyPrinciples } }` (cut-plan/index.ts:284). Use `data.plan` (not the legacy `data?.plan ?? data` fallback — W3 standardised on the wrapper).

### 5.2 `generate-weight-plan` (losers)

Verified from `supabase/functions/generate-weight-plan/index.ts:39-43`:

| Field | Type | Source |
|---|---|---|
| `currentWeight` | number | `parseFloat(form.current_weight_kg)` |
| `goalWeight` | number | `parseFloat(form.goal_weight_kg)` |
| `targetWeeks` | number | `parseInt(form.target_weeks)` |
| `age`, `sex`, `heightCm`, `activityLevel`, `trainingFrequency`, `bmr`, `tdee` | as above | as above |
| `foodBudget` | string | `form.food_budget \|\| "flexible"` |
| `planAggressiveness` | string | hard-code `"balanced"` (spec §4.2 dropped this field for fighters; non-fighters still need a value the legacy fn accepts) |

Response: `{ plan: { weeklyPlan, summary, totalWeeks, mealIdeas, weeklyChecklist, keyPrinciples } }`.

The orchestrator's `buildPlanRequestBody(form)` is one ~30-line switch on `goal_type`.

---

## 6. Paywall placement

Paywall is **REMOVED** from the end-of-onboarding flow per spec §5.2. Specifically: do not import `presentPaywallIfNeeded` from `@/lib/purchases` in the new orchestrator (legacy Onboarding.tsx:20 + 489–494 — these go away).

The first gem-spending action triggers the paywall. This is already implemented inside `useSubscription()` (`src/hooks/useSubscription.ts:1`) and the `SubscriptionContext` (`src/contexts/SubscriptionContext.tsx`). The implementer does **nothing** here — just confirm via a manual smoke test that scanning a meal as a fresh non-premium user surfaces the paywall (see §9 manual script).

---

## 7. D1 retention notification

`@capacitor/local-notifications` is **already installed** (`package.json` declares `^8.0.1`; iOS Package.swift already references `CapacitorLocalNotifications`). No new install needed.

Implementation: extend `src/lib/weightReminder.ts` (which already imports `LocalNotifications` and reserves ID 9001) with one new function:

```ts
const D1_NOTIFICATION_ID = 9101;  // distinct from 9001 weight-reminder

export async function scheduleD1MorningWeighIn(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.requestPermissions().catch(() => {});
    // Cancel first so re-onboarding never double-schedules.
    await LocalNotifications.cancel({ notifications: [{ id: D1_NOTIFICATION_ID }] }).catch(() => {});
    const tomorrow8am = new Date();
    tomorrow8am.setDate(tomorrow8am.getDate() + 1);
    tomorrow8am.setHours(8, 0, 0, 0);
    await LocalNotifications.schedule({
      notifications: [{
        id: D1_NOTIFICATION_ID,
        title: "FightCamp Wizard",
        body: "Good morning — log your first weigh-in",
        schedule: { at: tomorrow8am, allowWhileIdle: true },
        sound: "default",
      }],
    });
  } catch (err) {
    logger.warn("scheduleD1MorningWeighIn failed", { err: String(err) });
    // Non-fatal: never block onboarding completion on a notification failure.
  }
}
```

The orchestrator's `handleFinalSubmit` calls this (no `await` blocking — wrap in `.catch(() => {})` if you want belt-and-braces). Stable IDs guarantee re-onboarding does not double-schedule.

---

## 8. What NOT to ship in this PR

- **Social-proof microcopy** (e.g. "2,341 fighters started a camp this week"): spec hints at A/B-ready hooks. Capture nothing now; do not add a `social_proof_variant` column. Out of scope.
- **Win-back D7+ push that consumes `motivation_note`**: capture the note (Step1Goal.tsx already accepts the input — orchestrator must persist it in `buildProfilePartial`), but DO NOT schedule any D7+ notification this PR. The text is dormant data.
- **Email collection beyond `display_name`**: defer entirely. No `email_marketing_opt_in` column, no email field in any step.
- **`presentPaywallIfNeeded()` import**: must be deleted from the new orchestrator.
- **Legacy 15-step flow shim**: do NOT keep the old Onboarding.tsx as a feature flag. The legacy file is replaced wholesale; revert via git if needed. Keep the diff clean.
- **Schema migration on `motivation_note` past raw text storage**: store the string as-is in `profiles.motivation_note`. No tokenisation, no embedding.

---

## 9. Test plan

### 9.1 Unit tests (new, under `tests/onboarding/`)

Create `tests/onboarding/orchestrator.test.tsx` with seven cases:

1. `goal_type === "cutting"` → after step 1, `goNext()` lands on step 2.
2. `goal_type === "losing"` → after step 1, `goNext()` skips step 2 and lands on step 3 substep "a".
3. From step 3 substep "a" with valid `display_name`, `goNext()` → step 3 substep "b".
4. From step 3 substep "b" (loser, valid body) → step 3 substep "c" (cycle screen still rendered briefly when `sex==="female"`); when `sex==="male"`, skips straight to step 4.
5. From step 3 substep "c" (any sex) → step 4.
6. From step 4 → step 5; skip from step 5 → step 6; skip from step 6 → step 7 AND `kickOffPlanGeneration` was called exactly once.
7. From step 7 with `submitting=true`, double-click on "Start camp" only triggers one `handleFinalSubmit` (idempotency guard).

Stack: existing `vitest` + `@testing-library/react`. Mock `supabase.functions.invoke` and `supabase.from`.

### 9.2 Type + build

- `npm run lint` passes (zero new warnings).
- `tsc --noEmit` passes (or `npm run build`).
- `npm run build` succeeds end-to-end.
- `npm test` passes (existing + 7 new).

### 9.3 Manual UI walkthrough (debugger agent)

Capacitor iOS simulator, fresh signup:

**Cutter path.** Sign up → land on `/onboarding`. Step 1: pick "I have a fight coming up", pick MMA, type 1-line motivation. Step 2: pick UFC (verify weighin auto-fills 30h), enter fight_date 30 days out, weight class 77.1. Step 3a: type display name. Step 3b: sex M, age 27, height 178cm, walking 84, current 80. Step 3c: skip (M). Step 4: pro_lt5, 5 days, sparring+pads, orthodox. Step 5: skip. Step 6: leave defaults, continue. Step 7: see plan loaded; tap "Start camp". Assert: lands on `/dashboard`; `select id, current_fight_camp_id, onboarding_completed_at from profiles where id=…` returns a uuid + a timestamp; `select id, is_active from fight_camps where user_id=…` returns one row with `is_active=true`; D1 notification visible in iOS settings.

**Loser path.** Fresh signup. Step 1: "I want to lose weight". Verify Step 2 is skipped (goNext lands directly on Step 3a). Fill 3a/3b/3c (require goal_weight + target_weeks). Step 4/5/6 as above. Step 7 → `/dashboard`. Assert: NO `fight_camps` row created; `current_fight_camp_id` is null.

### 9.4 Resume test

Manually `update profiles set onboarding_step=4, … where id=…;` for a fresh test user that has the row but no `onboarding_completed_at`. Cold-launch the app → orchestrator opens at step 4, NOT step 1. Verify the form was hydrated from the previously-written columns (use `mergeProfileIntoForm`).

### 9.5 Paywall smoke test

After the loser path completes, navigate to Nutrition → "Analyze meal photo". Confirm the paywall surfaces (gem-spend trigger). Confirm it does NOT appear at the end of onboarding.

---

## 10. ProfileData reconciliation (W1 → W2 form)

Every `OnboardingFormData` field maps to a typed `ProfileData` column. Verified against `src/contexts/UserContext.tsx:14-62`, `src/lib/queryColumns.ts:1`, and `supabase/migrations/20260428225700_ai_overhaul_foundation.sql`:

| Form field | DB column | Migration that added it |
|---|---|---|
| `goal_type` | `goal_type` | pre-W1 |
| `sport` | `sport` | W1 (20260428225700) |
| `motivation_note` | `motivation_note` | **W2 — this PR** (§3) |
| `sanctioning_body` | `sanctioning_body` | W1 |
| `weighin_to_bout_hours` | `weighin_to_bout_hours` | W1 |
| `fight_date` | `target_date` (mirror) AND `fight_camps.fight_date` | pre-W1 / pre-W1 |
| `weight_class_kg` | `weight_class_kg` AND legacy `goal_weight_kg` (write both for compat) | W1 / pre-W1 |
| `display_name` | `display_name` | already present (20260427040000) — **do not re-add** |
| `sex`, `age`, `height_cm`, `current_weight_kg`, `goal_weight_kg`, `training_frequency` | same names | pre-W1 |
| `walking_weight_kg` | `walking_weight_kg` | W1 |
| `imperial_units` | `imperial_units` | W1 |
| `menstrual_tracking_enabled` | `menstrual_tracking_enabled` | W1 |
| `experience` | `experience` (typed) AND `experience_level` (legacy alias for backward compat) | W1 / pre-W1 |
| `training_types` | `training_types` (text[]) | pre-W1 |
| `stance` | `stance` | W1 |
| `dietary_restrictions` | `user_dietary_preferences.dietary_restrictions` (separate table) | pre-W1 |
| `food_budget` | `food_budget` | pre-W1 |
| `notif_*` | `notification_prefs` jsonb | **W2 — this PR** (§3) |
| `edited_calories`, `edited_protein_g` | `ai_recommended_calories`, `ai_recommended_protein_g` | pre-W1 |
| `target_weeks` | derived → `target_date = today + target_weeks*7` | pre-W1 |

**Drift call-outs the implementer must NOT fall into:**

- Do NOT write to `athlete_type` (legacy free-text). The new flow uses `sport`. Leave it null on new rows.
- Do NOT write to `competition_level`, `plan_aggressiveness`, `sleep_hours`, `primary_struggle`, or `body_fat_pct`. Spec §4.2 deprecates them; legacy onboarding wrote them, the new orchestrator must not.
- DO continue to write `activity_level` (derived) and `experience_level` (mirror of `experience`) so the existing TDEE math + Goals page keep functioning until W3 cleans them up.

`buildProfilePartial(form)` is the single chokepoint enforcing this — review it carefully when implementing.

---

## 11. File-by-file diff summary

| File | Action | Approx LOC delta |
|---|---|---|
| `src/pages/Onboarding.tsx` | **REWRITE** to <350 LOC orchestrator | -1369, +~330 |
| `src/components/onboarding/steps/Step3About.tsx` | extend props with `substep` and conditionally render | +~25 |
| `src/components/ProfileCompletionGuard.tsx` | swap `!hasProfile` → `!profile?.onboarding_completed_at` | ~3 |
| `src/contexts/UserContext.tsx` | add 4 fields to `ProfileData` interface | +4 |
| `src/lib/queryColumns.ts` | append 4 fields to `PROFILE_COLUMNS` | +1 (single line) |
| `src/lib/weightReminder.ts` | add `scheduleD1MorningWeighIn` | +~25 |
| `supabase/migrations/20260429100000_w2_onboarding_columns.sql` | NEW migration | +~25 |
| `tests/onboarding/orchestrator.test.tsx` | NEW — 7 unit tests | +~250 |

Total net: roughly -700 LOC across the codebase, +325 of new orchestrator + tests.

---

## 12. Implementation order (do these in sequence in one branch)

1. Write the migration (§3) and apply locally; run a `supabase db reset` to confirm idempotency.
2. Update `queryColumns.ts` and `ProfileData` interface (§10).
3. Extend Step3About with `substep` prop (§4 Option A).
4. Add `scheduleD1MorningWeighIn` to `weightReminder.ts` (§7).
5. Write the new `Onboarding.tsx` orchestrator (§1).
6. Update `ProfileCompletionGuard` (§2.2).
7. Write the 7 unit tests (§9.1) — TDD optional but encouraged.
8. Run lint + build + tests.
9. Manual UI walkthrough on iOS sim (§9.3) for both paths.
10. Resume test (§9.4).
11. Paywall smoke test (§9.5).

If any step fails, debug-and-fix; do not skip ahead.

---

## 13. Done definition

- All 7 unit tests pass.
- `npm run build` is green; `npm run lint` is clean.
- Manual cutter path lands on `/dashboard` with an active fight camp linked to the profile.
- Manual loser path lands on `/dashboard` with `current_fight_camp_id IS NULL`.
- Killing the app at step 4 of a fresh signup, reopening, lands the user back at step 4 with their data preserved.
- The legacy `presentPaywallIfNeeded` import no longer exists in `src/pages/Onboarding.tsx`.
- A scanned meal as a fresh non-premium user shows the paywall.
- D1 morning notification appears in iOS Settings → Notifications scheduled list (`xcrun simctl push` not needed; we observe scheduled state).
