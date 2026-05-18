# Wizard Tutorial Redesign

Date: 2026-05-18
Status: Approved for implementation
Owner: Pratik

## Problem

The current onboarding tutorial in `src/tutorial/` feels janky. A centred card with Next and Back buttons fades in over a dimmed page, walks the user through 14 step descriptions, and fades out. The state machine, auto-trigger, navigation pause, and persistence layer all work. The visual shell does not.

Goals:

1. Make the tutorial feel native to iOS. Spring physics, glass materials, haptics, safe-area aware, gesture friendly.
2. Make the WeightCut Wizard mascot a character on screen. He bobs, tilts, and emits sparkles. Each step swaps a pose (idle, wave, point, celebrate).
3. Pair the wizard with an animated speech bubble that types out his dialogue.
4. Keep the existing 14-page tour, one bubble per page. Pace it with a Stories-style segmented progress bar grouped by section so 14 steps does not read as fatigue.
5. Use British spelling. No em dashes anywhere in shipping copy.

Non-goals:

- Lottie or new wizard art. Single webp plus CSS transforms is enough.
- Element-targeted spotlight cutouts. No current step targets a specific UI element.
- Auto-advance or play mode.
- Multi-bubble dialogue per step.

## Stage composition

A single full-screen overlay called `TutorialStage`, mounted via portal on top of whatever page the tour is showing. The current `TutorialOverlay.tsx` is replaced by this.

Layers, back to front:

1. **Live page**. The route the user is on (Dashboard, Nutrition, Weight, etc).
2. **Backdrop**. A fixed-inset element with `backdrop-filter: blur(6px) brightness(0.45)`. Static. We do not animate the filter value, only fade the layer's opacity in on mount.
3. **Progress bar**. Pinned to the top, padded with `env(safe-area-inset-top) + 8px`. Eight segments grouped by section (seven when the Cut section collapses for non-cutting users):
   - Welcome (1 step)
   - Dashboard (1)
   - Nutrition (2)
   - Weight (1)
   - Cut (0 to 2, conditional on `goalType === "cutting"`)
   - Camps and Training (2)
   - Recovery and Sleep (2)
   - Send-off (3)

   Each segment fills proportionally as the user moves through its sub-steps. Active segment uses `hsl(var(--primary))` accent. Completed segments are foreground at 60 percent opacity. Upcoming are 20 percent. Hairline 2px height.
4. **Wizard character**. Bottom-left, anchored 16px from left edge, padded `env(safe-area-inset-bottom) + 16px`. ~120px wide.
5. **Speech bubble**. Grows up and to the right from the wizard's mouth. Max-width 78vw, max-height 50vh.
6. **Action row**. Below the bubble, centred. Back (ghost) on the left, Next or Got it (filled) on the right.
7. **Skip pill**. Top-right, inside safe-area, translucent material capsule. Opens an action sheet.

Status bar forced light for the duration via `StatusBar.setStyle({ style: Style.Light })` from `@capacitor/status-bar` on mount, reverted on unmount.

## Wizard character animation

The mascot is the existing `src/assets/wizard-logo.webp`. We treat it as a puppet inside `motion.div` wrappers.

Layered transforms (all GPU only):

- **Idle bob**: `animate={{ y: [0, -6, 0] }}` infinite, 3.2s, easeInOut.
- **Breathe**: `animate={{ scale: [1, 1.015, 1] }}` infinite, 3.2s, easeInOut, delay 0.4s so it does not phase-lock with bob.
- **Slow tilt**: `animate={{ rotate: [-1.5, 1.5, -1.5] }}` infinite, 5s, easeInOut.
- **Sparkle particles**: 4 to 6 absolutely-positioned `motion.div` stars around the hat. Each has its own random delay and 1.8s `opacity` plus `scale` loop. `mix-blend-mode: screen`.

Pose variants, driven by `step.wizardPose`:

- `idle`: just the layered loops above. Default.
- `wave`: one-shot `rotate: [0, -8, 6, 0]` over 480ms plus `x: [0, 4, 0]`. Plays when the step lands.
- `point`: persistent skew toward the bubble, `rotate: 4deg`. Lasts the step.
- `celebrate`: one-shot `y: [0, -24, 0]` jump with `scaleY: 0.92` squash on landing. Used on the final All Done step.

`useReducedMotion()` disables every loop and one-shot, leaving a static wizard.

## Speech bubble

Shape: rounded pill rect, `border-radius: 22px`, padding `16px 20px`.

Materials:

- Fill `rgba(28, 28, 30, 0.72)` plus `backdrop-filter: blur(20px) saturate(180%)`. Maps to iOS `systemMaterialDark`.
- Hairline inner stroke `1px solid rgba(255,255,255,0.08)`.
- Shadow `0 20px 60px rgba(0,0,0,0.45)`.

Tail: SVG path at the bottom-left of the bubble pointing down-left toward the wizard's mouth. Rendered as a separate node so it can animate on its own spring after the bubble body.

Entrance animation:

```ts
initial: { scale: 0.6, opacity: 0, y: 8, rotate: -2 }
animate: { scale: 1, opacity: 1, y: 0, rotate: 0 }
transition: { type: "spring", stiffness: 520, damping: 28, mass: 0.8 }
```

`transform-origin` set on the tail tip so the bubble appears to grow out of the wizard.

Tail springs in 60ms after the body with `{ stiffness: 700, damping: 18 }`.

Idle breathing once mounted: `scale: [1, 1.005, 1]` over 2.4s, easeInOut.

Per-sentence "spoken" pulse: when the typewriter passes a `.` `?` or `!`, the bubble does a one-shot `scale: 1.02` 120ms pulse.

## Typewriter

`TypewriterText` is a pure presentational component. It accepts `text`, `pace`, `onComplete`, `forceComplete`. It tracks `revealedCount: number` and renders `text.slice(0, revealedCount)` plus a blinking caret span while typing.

Pace:

- `normal`: 28ms per char.
- `slow`: 55ms per char.

Implementation:

- Single `setInterval` updates state once per tick. No per-char DOM nodes. Just one text node and a caret span.
- `revealKey: string` prop on `SpeechBubble` (set to `step.id`). When it changes, the bubble's internal `useEffect` resets `revealedCount` to 0 and restarts the interval.
- `forceComplete: boolean` prop. When set to true, immediately fills the text and fires `onComplete`.

JRPG skip-to-end pattern, owned by `TutorialStage`:

- Stage holds a `bubbleComplete: boolean` flag.
- `onTapBackdrop`:
  - If typing not done, set `forceComplete = true`. Bubble snaps to full text. `onComplete` fires, `bubbleComplete = true`.
  - If typing already done, treat as Next.
- On step change, reset `bubbleComplete` to false.
- The Next button always advances regardless of typing state. We never gate Next on completion. Backdrop-tap behaviour is the dual-tap pattern, button behaviour is single-tap.

Reduced motion: skip the interval entirely and reveal full text immediately.

## Step transitions

Bubble shrink, wizard hop, bubble regrow. ~360ms total.

1. Bubble exit: `scale → 0.6, opacity → 0, y: 8` over 180ms with `{ type: "spring", stiffness: 480, damping: 30 }`.
2. Wizard one-shot hop: `y: [0, -10, 0]` over 280ms, with `scaleY: [1, 0.94, 1]` squash on landing. Pose swap (if any) happens at the top of the hop.
3. If the next step has `navigateTo`, route push fires at the trough of the hop (~140ms in). The existing `NAV_SETTLE_MS = 600` in `TutorialContext.tsx` still gates bubble reappearance until the destination lazy chunk has rendered.
4. Bubble regrows with new text. Typewriter starts.

`AnimatePresence mode="wait"` wraps the bubble. Section boundaries fire `Haptics.impact({ style: ImpactStyle.Medium })`. Intra-section advances fire `Haptics.impact({ style: ImpactStyle.Light })`.

## Gestures

- **Tap on backdrop**: see JRPG skip-to-end above. First tap completes typing, second tap advances.
- **Tap Next button**: always advances. Selection haptic on press, advance haptic on release.
- **Swipe left**: advance one step. Swipe right: previous step. Velocity-thresholded so it does not fight iOS edge-swipe-back.
- **Tap Skip pill**: opens an action sheet with Skip (destructive), Resume later, Cancel. Skip confirm fires a Warning haptic and runs `skip()` from `TutorialContext`.
- **Long-press wizard**: deferred to v1.1. Will open a "Replay section" menu. Not built in v1.

Backdrop swallows pointer events on the page below so page interactions are disabled for the tour duration. This is desirable.

## Action row

Below the bubble, centred row:

- Back (ghost): visible when `stepIndex > 0`. 44pt tap target. Subtle.
- Next or Got it (filled): always visible. `bg-primary`, `text-primary-foreground`, `font-bold`, `rounded-xl`, 44pt. Label is `Got it` on the final step, `Next` everywhere else.

Skip pill in the top-right of the stage, translucent material capsule, `Skip` label, 32pt height.

## Progress bar mechanics

```ts
type Section = { id: string; label: string; stepIds: string[] };

const sections: Section[] = [
  { id: "welcome", label: "Welcome", stepIds: ["welcome"] },
  { id: "dashboard", label: "Dashboard", stepIds: ["dashboard-overview"] },
  { id: "nutrition", label: "Nutrition", stepIds: ["nutrition-page", "nutrition-features"] },
  { id: "weight", label: "Weight", stepIds: ["weight-tracker-page"] },
  { id: "cut", label: "Cut", stepIds: ["fight-week-page", "rehydration-page"] },
  { id: "camps", label: "Camps", stepIds: ["fight-camps-page", "training-calendar-page"] },
  { id: "recovery", label: "Recovery", stepIds: ["recovery-page", "sleep-page"] },
  { id: "sendoff", label: "Wrap", stepIds: ["quick-tips", "pro-features", "all-done"] },
];
```

`TutorialProgressBar` reads the current step id and computes per-segment fill ratio. Conditional `cut` section collapses to 0 segments when `goalType !== "cutting"` so the visible count drops to 7 segments for non-cutting users.

## Content (final copy)

British spelling. No em dashes. Wizard voice: speaks to "you", refers to himself as "I", one small magical flourish per three screens, Mickey-meets-magic gruff care.

```
Screen 1 . welcome
Headline: Good, you made it
Body: I'm the wizard, your corner for everything outside the cage. I'll keep your cut clean and your camp honest. Two minutes, then you're off.
Pose: wave

Screen 2 . dashboard-overview
Headline: This is home
Body: Your ring tracks the day, the wisdom keeps you sharp, the badges mark the work. Open this first, every morning.
Pose: idle

Screen 3 . nutrition-page
Headline: Food in, fight out
Body: Scan a barcode, search a food, or let Quick Fill read the plate. Build a personalised plan, then analyse the micros so nothing slips.
Pose: idle

Screen 4 . nutrition-features
Headline: Two tools, one job
Body: Analyse looks back, finding the gaps and quiet deficiencies. Generate looks forward, building meals around the macros you actually need.
Pose: point

Screen 5 . weight-tracker-page
Headline: Weigh in, every day
Body: One number, same time, no drama. Filter by week, month or all, and I'll analyse the trend so you see the truth, not the noise.
Pose: idle

Screen 6 . fight-week-page (cutting only)
Headline: The last seven days
Body: This is where the cut gets real. Water load, sodium taper, the lot. Follow it step by step and you'll walk to the scale calm.
Pose: idle

Screen 7 . rehydration-page (cutting only)
Headline: After the scale
Body: The fight is won in the hours after weigh-in. Sip the plan I lay out, hour by hour, fluid, salt and carbs in order. Don't freelance here.
Pose: point

Screen 8 . fight-camps-page
Headline: Organise the chaos
Body: Every camp gets its own home. Track the cut, log the sessions, drop in photos. When the next one starts, you'll know exactly what worked.
Pose: idle

Screen 9 . training-calendar-page
Headline: Log the rounds
Body: BJJ, Muay Thai, wrestling, strength, all in one place with an RPE. Each week I'll write you a short summary, so the patterns surface.
Pose: idle

Screen 10 . recovery-page
Headline: The other half of fitness
Body: Tell me how you slept, how sore you are, how the tank feels. The more you log, the sharper my recovery coach gets at calling your next move.
Pose: idle

Screen 11 . sleep-page
Headline: Hours in the bank
Body: Log the nights, watch the trend across a week, a month, three months. Sleep is the cheapest performance gain you've got. Spend it.
Pose: idle

Screen 12 . quick-tips
Headline: Two buttons to know
Body: The plus on the nav is your fast log, weight, meals, sessions, in seconds. The sparkle opens me up for a chat, any question, any time.
Pose: point

Screen 13 . pro-features
Headline: A quick note on Pro
Body: Manual logging, barcode and food search are yours, free, forever. The AI tools, the plans, the analysis, those live in Pro. Upgrade from Settings when you're ready.
Pose: idle

Screen 14 . all-done
Headline: That's the kit
Body: You can replay this from Settings whenever you like. Now go and do the work. I'll be here when you check in.
Pose: celebrate
```

Note: the "em dash" between screen number and slug above is a section header only. Body copy contains no em dashes. The implementer must scrub stray em dashes during the `description` rewrite.

Micro-copy defaults: `Next`, `Back`, `Skip`, `Got it`.

## Schema additions to `TutorialStep`

```ts
// src/tutorial/types.ts
export type WizardPose = "idle" | "wave" | "point" | "celebrate";
export type VoicePace = "normal" | "slow";

export interface TutorialStep {
  // ... existing fields kept as-is
  wizardPose?: WizardPose;   // default "idle"
  voicePace?: VoicePace;     // default "normal"
}
```

That is the entire schema delta. No new step ids, no multi-bubble dialogue, no element selectors.

The existing `title` field is repurposed as the bubble `headline`. The existing `description` field is the bubble `body`. We rewrite the strings to the copy above and add `wizardPose` to Welcome, Nutrition features, Rehydration, Quick Tips, and All Done. Everywhere else defaults to `idle`.

## Component decomposition

All new files live under `src/tutorial/`.

```
src/tutorial/
  TutorialContext.tsx     # kept, swap overlay for stage
  TutorialOverlay.tsx     # deleted
  TutorialTooltip.tsx     # deleted
  TutorialSpotlight.tsx   # deleted if no flow uses it (verify before removing)
  TutorialStage.tsx       # NEW, portal root, ~140 lines
  WizardCharacter.tsx     # NEW, character + poses, ~120 lines
  SpeechBubble.tsx        # NEW, bubble shell + tail + typewriter mount, ~140 lines
  TypewriterText.tsx      # NEW, char-by-char reveal, ~80 lines
  TutorialNav.tsx         # NEW, action row + skip pill, ~80 lines
  TutorialProgressBar.tsx # NEW, segmented progress, ~60 lines
  tutorialManager.ts      # kept unchanged
  tutorialPersistence.ts  # kept unchanged
  useTutorial.ts          # kept unchanged
  types.ts                # kept, add WizardPose, VoicePace, schema fields
  flows/onboardingFlow.ts # kept, bump version 8 -> 9, replace title and description per copy above
  flows/featureFlows.ts   # kept unchanged
```

Six new files, each well under the 250-line ceiling.

### `TutorialStage.tsx` public interface

```ts
interface StageProps {
  isActive: boolean;
  currentStep: TutorialStep | null;
  currentStepIndex: number;
  totalSteps: number;
  flowId: string | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}
```

Responsibilities:

- Portal to `document.body` (kept from current overlay).
- Render backdrop, progress bar, wizard, bubble, nav.
- Own `bubbleComplete` state and pass `forceComplete` to bubble.
- Handle backdrop tap, swipe left, swipe right.
- Set / restore `StatusBar.setStyle`.
- Wrap children in `OverlayErrorBoundary` (kept).
- Fire haptics on step transitions (Medium on section change, Light otherwise).

### `WizardCharacter.tsx` public interface

```ts
interface WizardProps {
  pose: WizardPose;
  onTap?: () => void;
}
```

Renders the webp inside motion wrappers. Subscribes to `useReducedMotion()`.

### `SpeechBubble.tsx` public interface

```ts
interface BubbleProps {
  headline: string;
  body: string;
  revealKey: string;
  pace?: VoicePace;
  forceComplete: boolean;
  onTypingComplete: () => void;
}
```

Hosts `TypewriterText`. Owns the entrance spring and tail SVG. Pulses on sentence boundaries.

### `TypewriterText.tsx` public interface

```ts
interface TypewriterProps {
  text: string;
  pace: VoicePace;
  forceComplete: boolean;
  onComplete: () => void;
}
```

Internal `revealedCount: number`. Resets on `text` change.

### `TutorialNav.tsx` public interface

```ts
interface NavProps {
  isFirstStep: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}
```

Renders Back and Next or Got it row plus the floating Skip pill.

### `TutorialProgressBar.tsx` public interface

```ts
interface ProgressBarProps {
  steps: TutorialStep[];
  currentStepIndex: number;
}
```

Computes section segments and fill ratios internally.

## Wiring into `TutorialContext.tsx`

Only change: replace the `<TutorialOverlay ... />` element at the bottom of the provider's JSX with `<TutorialStage ... />` using the same prop shape, plus `flowId={state.currentFlow?.id ?? null}`. Everything else in the file stays. The `pausedFlowRef`, `autoTriggeredRef`, `NAV_SETTLE_MS`, `justOnboarded` handshake, demo-data seeding, `replayTutorial`, `skip`, all retained.

## Migration

- Bump `onboardingFlow.version` from 8 to 9 in `flows/onboardingFlow.ts`.
- `tutorialPersistence.isFlowCompleted` already compares completed-version to current. Every existing user will see the new tour exactly once on their next dashboard visit. This is the desired behaviour given how visually different the new tour is.
- No data migration is needed. `wcw_onboarding_just_completed`, `wcw_tutorial_shown_${userId}`, and progress index keys retain their meaning.
- Delete `TutorialOverlay.tsx`, `TutorialTooltip.tsx`. Before deleting `TutorialSpotlight.tsx`, grep the repo for imports. If `featureFlows.ts` or any other flow targets specific UI elements via `target`, retain the file.

## Performance

iOS-targeted, must hold 60fps on iPhone 12 baseline:

- All motion is `transform` and `opacity` only. No layout-triggering property animations.
- Wizard sits in a fixed container with `transform: translateZ(0)` and `will-change: transform, opacity`.
- Bubble does the same.
- Typewriter does one `setState` per tick. No per-char DOM nodes.
- Backdrop `backdrop-filter` is set once at mount. We fade `opacity` from 0 to 1 over 220ms, we do not animate the blur radius.
- `TutorialStage` only mounts when `state.isActive && !waitingForNav`. The dashboard render path is untouched when the tour is not active.
- Sparkle particles capped at 6. Reduced-motion disables them entirely.

## Risks

1. **Lazy-page race**. The existing `NAV_SETTLE_MS = 600` already handles this. New stage must consume `waitingForNav` exactly as the current overlay does. Stage simply does not render when `waitingForNav` is true.
2. **`navigateTo` interrupting typing**. When a step has `navigateTo`, the stage unmounts during `waitingForNav`. The next mount uses the new step id as `revealKey`, so typewriter state is correct.
3. **Skip mid-typing**. Handled by the JRPG dual-tap pattern. The Next button is always live.
4. **Horizontal swipe collision with iOS edge-swipe-back**. Stage swipes use a velocity threshold and ignore swipes starting within 12px of the left edge.
5. **Safe area on notched devices**. Wizard padded by `env(safe-area-inset-bottom) + 16px`. Progress bar by `env(safe-area-inset-top) + 8px`. Skip pill by both inset-top and inset-right.
6. **Reduced motion**. Every motion primitive honours `useReducedMotion()`. Typewriter snaps to full text. Idle loops disable. Bubble entrance becomes a 120ms opacity fade.
7. **Removing `TutorialSpotlight`**. Verify no `featureFlow` step uses `target` before deletion.
8. **Existing `featureFlows` use `TutorialTooltip`** if any reference is found. Verify before deleting the tooltip. If feature flows still use the old visual, keep the tooltip file under a renamed path used only by feature flows, or migrate those flows to the new stage with a feature flag.

## Testing

- Manual iOS device run on iPhone 12 or newer for haptics, safe area, and motion feel.
- Manual Safari and Chrome on macOS for typewriter cadence and layout.
- Replay the tour via Settings to confirm `replayTutorial` clears state and restarts cleanly.
- Toggle reduced motion in iOS Settings and verify no loops, full text snap, no haptics.
- Skip mid-tour from screens 1, 7, and 14. Confirm dashboard return on non-dashboard skips.
- Run the cutting-only path (`goalType === "cutting"`) and the non-cutting path. Verify Cut segments appear or collapse.
- Bump-version migration: log in as an existing v8-complete user, confirm the new tour fires once and persists v9 completion.

## Out of scope (deliberately, again)

- Lottie or commissioned wizard animation art.
- Element-targeted spotlight cutouts.
- Auto-advance and play mode.
- Multi-bubble dialogue per step.
- Long-press wizard "Replay section" menu (v1.1).
- Section picker on replay (v1.1).
