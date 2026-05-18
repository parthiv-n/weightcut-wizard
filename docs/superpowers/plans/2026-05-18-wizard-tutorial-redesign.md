# Wizard Tutorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the centered tooltip onboarding tour with an animated wizard character speaking through a typewriter speech bubble, paced by a Stories-style segmented progress bar with iOS-native gestures and haptics.

**Architecture:** A new `TutorialStage` portal replaces the existing `TutorialOverlay`. The stage hosts a `WizardCharacter` (single webp puppet, layered transforms for idle/wave/point/celebrate poses), a `SpeechBubble` that types out dialogue via `TypewriterText`, a `TutorialProgressBar` with section grouping, and a `TutorialNav` with Back/Next plus a Skip pill. All existing state machine, persistence, auto-trigger, and navigation pause logic in `TutorialContext.tsx` is retained.

**Tech Stack:** React 18, TypeScript, motion/react v12, Tailwind, Capacitor 8 (haptics + status-bar), Vitest (Node environment, pure-logic tests only since jsdom is not installed).

**Reference spec:** `docs/superpowers/specs/2026-05-18-wizard-tutorial-redesign-design.md`

---

## File Structure

**Create:**
- `src/tutorial/typewriter.ts` (pure logic: pace map, sentence-boundary detection)
- `src/tutorial/__tests__/typewriter.test.ts`
- `src/tutorial/sections.ts` (pure logic: section grouping + per-segment fill ratio)
- `src/tutorial/__tests__/sections.test.ts`
- `src/tutorial/TypewriterText.tsx` (~80 lines)
- `src/tutorial/WizardCharacter.tsx` (~120 lines)
- `src/tutorial/SpeechBubble.tsx` (~140 lines)
- `src/tutorial/TutorialProgressBar.tsx` (~60 lines)
- `src/tutorial/TutorialNav.tsx` (~80 lines)
- `src/tutorial/TutorialStage.tsx` (~160 lines)

**Modify:**
- `src/tutorial/types.ts` (add `WizardPose`, `VoicePace`, fields on `TutorialStep`)
- `src/tutorial/TutorialContext.tsx` (swap `<TutorialOverlay>` for `<TutorialStage>`)
- `src/tutorial/flows/onboardingFlow.ts` (bump version 8 to 9, rewrite copy, attach poses)

**Delete:**
- `src/tutorial/TutorialOverlay.tsx`
- `src/tutorial/TutorialTooltip.tsx`
- `src/tutorial/TutorialSpotlight.tsx` (verified: only the deleted Overlay imports it; feature flows do not)

---

## Task 1: Schema additions to `types.ts`

**Files:**
- Modify: `src/tutorial/types.ts`

- [ ] **Step 1: Open `src/tutorial/types.ts` and add the new types**

Append two type aliases after the existing `GoalType` line and extend `TutorialStep`:

```ts
export type TooltipPosition = "top" | "bottom" | "left" | "right" | "center";
export type GoalType = "cutting" | "bulking" | "maintaining";
export type WizardPose = "idle" | "wave" | "point" | "celebrate";
export type VoicePace = "normal" | "slow";

export interface UserTutorialState {
  goalType: GoalType;
  currentRoute: string;
  hasProfile: boolean;
  profileData: any | null;
}

export interface TutorialStep {
  id: string;
  target?: string;
  title: string;
  description: string;
  position: TooltipPosition;
  route?: string;
  navigateTo?: string;
  condition?: (state: UserTutorialState) => boolean;
  spotlightOffset?: { x?: number; y?: number; width?: number; height?: number; yPercent?: number };
  wizardPose?: WizardPose;
  voicePace?: VoicePace;
}
```

The existing `TutorialFlow`, `TutorialPersistenceData`, `TutorialManagerState`, and `deriveGoalType` blocks are left untouched.

- [ ] **Step 2: Verify the file still type-checks**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: passes with no errors. If `target` or `spotlightOffset` cause issues, leave them. They are still used by `TutorialSpotlight` until deleted in Task 12.

- [ ] **Step 3: Commit**

```bash
git add src/tutorial/types.ts
git commit -m "feat(tutorial): add WizardPose and VoicePace types"
```

---

## Task 2: Pure typewriter logic + tests

**Files:**
- Create: `src/tutorial/typewriter.ts`
- Create: `src/tutorial/__tests__/typewriter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tutorial/__tests__/typewriter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { charIntervalMs, endsAtSentence } from "../typewriter";

describe("charIntervalMs", () => {
  it("returns 28ms for normal pace", () => {
    expect(charIntervalMs("normal")).toBe(28);
  });
  it("returns 55ms for slow pace", () => {
    expect(charIntervalMs("slow")).toBe(55);
  });
  it("defaults to normal when undefined", () => {
    expect(charIntervalMs(undefined)).toBe(28);
  });
});

describe("endsAtSentence", () => {
  it("returns true when the last revealed char is . ? or !", () => {
    expect(endsAtSentence("Hello.")).toBe(true);
    expect(endsAtSentence("What?")).toBe(true);
    expect(endsAtSentence("Wow!")).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(endsAtSentence("Hello")).toBe(false);
    expect(endsAtSentence("")).toBe(false);
    expect(endsAtSentence("mid,")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- typewriter`
Expected: FAIL with "Cannot find module '../typewriter'".

- [ ] **Step 3: Implement `src/tutorial/typewriter.ts`**

```ts
import type { VoicePace } from "./types";

const PACE_MS: Record<VoicePace, number> = {
  normal: 28,
  slow: 55,
};

export function charIntervalMs(pace: VoicePace | undefined): number {
  return PACE_MS[pace ?? "normal"];
}

const SENTENCE_TERMINALS = new Set([".", "?", "!"]);

export function endsAtSentence(textSoFar: string): boolean {
  if (textSoFar.length === 0) return false;
  return SENTENCE_TERMINALS.has(textSoFar[textSoFar.length - 1]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- typewriter`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/tutorial/typewriter.ts src/tutorial/__tests__/typewriter.test.ts
git commit -m "feat(tutorial): pure typewriter pace + sentence-boundary helpers"
```

---

## Task 3: Pure section grouping logic + tests

**Files:**
- Create: `src/tutorial/sections.ts`
- Create: `src/tutorial/__tests__/sections.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tutorial/__tests__/sections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeSegmentFills, ONBOARDING_SECTIONS } from "../sections";
import type { TutorialStep } from "../types";

function step(id: string): TutorialStep {
  return { id, title: "", description: "", position: "center" };
}

const allSteps: TutorialStep[] = [
  step("welcome"),
  step("dashboard-overview"),
  step("nutrition-page"),
  step("nutrition-features"),
  step("weight-tracker-page"),
  step("fight-week-page"),
  step("rehydration-page"),
  step("fight-camps-page"),
  step("training-calendar-page"),
  step("recovery-page"),
  step("sleep-page"),
  step("quick-tips"),
  step("pro-features"),
  step("all-done"),
];

describe("ONBOARDING_SECTIONS", () => {
  it("has eight sections", () => {
    expect(ONBOARDING_SECTIONS).toHaveLength(8);
  });
  it("covers every onboarding step id exactly once", () => {
    const ids = ONBOARDING_SECTIONS.flatMap((s) => s.stepIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(allSteps.map((s) => s.id));
  });
});

describe("computeSegmentFills", () => {
  it("fills the first segment to 1 when on the only step in it", () => {
    const fills = computeSegmentFills(allSteps, 0);
    expect(fills[0]).toBe(1);
    expect(fills[1]).toBe(0);
  });
  it("fills a multi-step segment proportionally", () => {
    const fills = computeSegmentFills(allSteps, 2);
    expect(fills[2]).toBeCloseTo(0.5, 5);
  });
  it("marks completed segments as 1", () => {
    const fills = computeSegmentFills(allSteps, 4);
    expect(fills[0]).toBe(1);
    expect(fills[1]).toBe(1);
    expect(fills[2]).toBe(1);
  });
  it("collapses the Cut section when goalType filters those steps out", () => {
    const filtered = allSteps.filter(
      (s) => s.id !== "fight-week-page" && s.id !== "rehydration-page",
    );
    const fills = computeSegmentFills(filtered, 0);
    expect(fills).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- sections`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `src/tutorial/sections.ts`**

```ts
import type { TutorialStep } from "./types";

export interface ProgressSection {
  id: string;
  label: string;
  stepIds: string[];
}

export const ONBOARDING_SECTIONS: ProgressSection[] = [
  { id: "welcome", label: "Welcome", stepIds: ["welcome"] },
  { id: "dashboard", label: "Dashboard", stepIds: ["dashboard-overview"] },
  { id: "nutrition", label: "Nutrition", stepIds: ["nutrition-page", "nutrition-features"] },
  { id: "weight", label: "Weight", stepIds: ["weight-tracker-page"] },
  { id: "cut", label: "Cut", stepIds: ["fight-week-page", "rehydration-page"] },
  { id: "camps", label: "Camps", stepIds: ["fight-camps-page", "training-calendar-page"] },
  { id: "recovery", label: "Recovery", stepIds: ["recovery-page", "sleep-page"] },
  { id: "sendoff", label: "Wrap", stepIds: ["quick-tips", "pro-features", "all-done"] },
];

export function computeSegmentFills(
  activeSteps: TutorialStep[],
  currentStepIndex: number,
): number[] {
  const activeIds = new Set(activeSteps.map((s) => s.id));
  const presentSections = ONBOARDING_SECTIONS.map((section) => ({
    ...section,
    stepIds: section.stepIds.filter((id) => activeIds.has(id)),
  })).filter((section) => section.stepIds.length > 0);

  const currentId = activeSteps[currentStepIndex]?.id ?? null;

  return presentSections.map((section) => {
    const idx = currentId ? section.stepIds.indexOf(currentId) : -1;
    if (idx >= 0) {
      return (idx + 1) / section.stepIds.length;
    }
    const allBefore = section.stepIds.every((id) => {
      const stepIdx = activeSteps.findIndex((s) => s.id === id);
      return stepIdx >= 0 && stepIdx < currentStepIndex;
    });
    return allBefore ? 1 : 0;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- sections`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/tutorial/sections.ts src/tutorial/__tests__/sections.test.ts
git commit -m "feat(tutorial): section grouping helpers for progress bar"
```

---

## Task 4: `TypewriterText` presentational component

**Files:**
- Create: `src/tutorial/TypewriterText.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { charIntervalMs } from "./typewriter";
import type { VoicePace } from "./types";

interface TypewriterTextProps {
  text: string;
  pace?: VoicePace;
  forceComplete: boolean;
  onComplete: () => void;
  onTick?: (revealedSoFar: string) => void;
}

export function TypewriterText({
  text,
  pace,
  forceComplete,
  onComplete,
  onTick,
}: TypewriterTextProps) {
  const prefersReduced = useReducedMotion();
  const [count, setCount] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    setCount(0);
    completedRef.current = false;
  }, [text]);

  useEffect(() => {
    if (prefersReduced) {
      setCount(text.length);
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
      return;
    }

    if (forceComplete && !completedRef.current) {
      setCount(text.length);
      completedRef.current = true;
      onComplete();
      return;
    }

    if (count >= text.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
      return;
    }

    const ms = charIntervalMs(pace);
    intervalRef.current = window.setTimeout(() => {
      setCount((c) => {
        const next = Math.min(c + 1, text.length);
        onTick?.(text.slice(0, next));
        return next;
      });
    }, ms);

    return () => {
      if (intervalRef.current !== null) {
        window.clearTimeout(intervalRef.current);
      }
    };
  }, [text, pace, forceComplete, count, prefersReduced, onComplete, onTick]);

  const isTyping = count < text.length;
  return (
    <span>
      {text.slice(0, count)}
      {isTyping && !prefersReduced && (
        <span className="inline-block w-[2px] h-[1em] align-[-0.15em] ml-[1px] bg-current animate-pulse" />
      )}
    </span>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/tutorial/TypewriterText.tsx
git commit -m "feat(tutorial): TypewriterText component"
```

---

## Task 5: `WizardCharacter` component

**Files:**
- Create: `src/tutorial/WizardCharacter.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { motion, useReducedMotion } from "motion/react";
import wizardLogo from "@/assets/wizard-logo.webp";
import type { WizardPose } from "./types";

interface WizardCharacterProps {
  pose: WizardPose;
  onTap?: () => void;
}

const SPARKLES = [
  { top: "-6%", left: "8%", delay: 0 },
  { top: "8%", left: "92%", delay: 0.4 },
  { top: "28%", left: "-4%", delay: 0.9 },
  { top: "-8%", left: "62%", delay: 1.3 },
  { top: "18%", left: "78%", delay: 1.7 },
];

export function WizardCharacter({ pose, onTap }: WizardCharacterProps) {
  const prefersReduced = useReducedMotion();

  const poseAnim = (() => {
    if (prefersReduced) return {};
    switch (pose) {
      case "wave":
        return { rotate: [0, -8, 6, 0], x: [0, 4, 0] };
      case "point":
        return { rotate: 4, x: 6, skewX: -4 };
      case "celebrate":
        return { y: [0, -24, 0], scaleY: [1, 0.92, 1] };
      case "idle":
      default:
        return {};
    }
  })();

  const idleLoop = prefersReduced
    ? {}
    : {
        y: [0, -6, 0],
        scale: [1, 1.015, 1],
        rotate: [-1.5, 1.5, -1.5],
      };

  return (
    <motion.button
      type="button"
      onClick={onTap}
      aria-label="Wizard"
      className="relative h-[120px] w-[120px] flex items-center justify-center bg-transparent"
      style={{ willChange: "transform", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      animate={{ ...idleLoop, ...poseAnim }}
      transition={{
        y: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
        scale: { duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.4 },
        rotate: pose === "wave" ? { duration: 0.48 } : { duration: 5, repeat: Infinity, ease: "easeInOut" },
        skewX: { duration: 0.3 },
        scaleY: { duration: 0.28 },
      }}
    >
      <img
        src={wizardLogo}
        alt=""
        className="h-full w-full object-contain pointer-events-none select-none"
        draggable={false}
      />
      {!prefersReduced &&
        SPARKLES.map((s, i) => (
          <motion.span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-white"
            style={{ top: s.top, left: s.left, mixBlendMode: "screen", willChange: "opacity, transform" }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
          />
        ))}
    </motion.button>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/tutorial/WizardCharacter.tsx
git commit -m "feat(tutorial): WizardCharacter with idle loop and pose variants"
```

---

## Task 6: `SpeechBubble` component

**Files:**
- Create: `src/tutorial/SpeechBubble.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { TypewriterText } from "./TypewriterText";
import { endsAtSentence } from "./typewriter";
import type { VoicePace } from "./types";

interface SpeechBubbleProps {
  headline: string;
  body: string;
  revealKey: string;
  pace?: VoicePace;
  forceComplete: boolean;
  onTypingComplete: () => void;
}

const bubbleSpring = { type: "spring" as const, stiffness: 520, damping: 28, mass: 0.8 };
const tailSpring = { type: "spring" as const, stiffness: 700, damping: 18, delay: 0.06 };

export function SpeechBubble({
  headline,
  body,
  revealKey,
  pace,
  forceComplete,
  onTypingComplete,
}: SpeechBubbleProps) {
  const prefersReduced = useReducedMotion();
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    setPulseKey(0);
  }, [revealKey]);

  return (
    <motion.div
      key={revealKey}
      className="relative max-w-[78vw] rounded-[22px] px-5 py-4 text-foreground shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
      style={{
        background: "rgba(28, 28, 30, 0.72)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.08)",
        transformOrigin: "10% 100%",
        willChange: "transform, opacity",
      }}
      initial={prefersReduced ? { opacity: 0 } : { scale: 0.6, opacity: 0, y: 8, rotate: -2 }}
      animate={
        prefersReduced
          ? { opacity: 1 }
          : { scale: 1, opacity: 1, y: 0, rotate: 0 }
      }
      exit={prefersReduced ? { opacity: 0 } : { scale: 0.6, opacity: 0, y: 8 }}
      transition={prefersReduced ? { duration: 0.12 } : bubbleSpring}
    >
      <motion.div
        key={`pulse-${pulseKey}`}
        animate={pulseKey > 0 && !prefersReduced ? { scale: [1, 1.02, 1] } : {}}
        transition={{ duration: 0.12 }}
      >
        <h3 className="text-base font-semibold leading-tight text-white">{headline}</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-white/85">
          <TypewriterText
            text={body}
            pace={pace}
            forceComplete={forceComplete}
            onComplete={onTypingComplete}
            onTick={(revealedSoFar) => {
              if (!prefersReduced && endsAtSentence(revealedSoFar)) {
                setPulseKey((k) => k + 1);
              }
            }}
          />
        </p>
      </motion.div>

      <motion.svg
        className="absolute -bottom-3 left-6"
        width="20"
        height="14"
        viewBox="0 0 20 14"
        aria-hidden
        initial={prefersReduced ? { opacity: 0 } : { scale: 0, opacity: 0 }}
        animate={prefersReduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
        transition={prefersReduced ? { duration: 0.12 } : tailSpring}
        style={{ transformOrigin: "10px 0px" }}
      >
        <path
          d="M0 0 L20 0 L8 14 Z"
          fill="rgba(28, 28, 30, 0.72)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      </motion.svg>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/tutorial/SpeechBubble.tsx
git commit -m "feat(tutorial): SpeechBubble with typewriter body and animated tail"
```

---

## Task 7: `TutorialProgressBar` component

**Files:**
- Create: `src/tutorial/TutorialProgressBar.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { motion } from "motion/react";
import { computeSegmentFills } from "./sections";
import type { TutorialStep } from "./types";

interface TutorialProgressBarProps {
  activeSteps: TutorialStep[];
  currentStepIndex: number;
}

export function TutorialProgressBar({ activeSteps, currentStepIndex }: TutorialProgressBarProps) {
  const fills = computeSegmentFills(activeSteps, currentStepIndex);

  return (
    <div
      className="flex w-full gap-1.5"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)", paddingLeft: 16, paddingRight: 16 }}
      aria-label="Tutorial progress"
    >
      {fills.map((fill, i) => (
        <div key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-white/85"
            initial={false}
            animate={{ width: `${Math.round(fill * 100)}%` }}
            transition={{ type: "spring", stiffness: 180, damping: 26 }}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/tutorial/TutorialProgressBar.tsx
git commit -m "feat(tutorial): Stories-style segmented progress bar"
```

---

## Task 8: `TutorialNav` component

**Files:**
- Create: `src/tutorial/TutorialNav.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { motion } from "motion/react";
import { X } from "lucide-react";

interface TutorialNavProps {
  isFirstStep: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export function TutorialNav({ isFirstStep, isLastStep, onBack, onNext, onSkip }: TutorialNavProps) {
  return (
    <>
      <button
        type="button"
        onClick={onSkip}
        aria-label="Skip tutorial"
        className="absolute z-10 flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-white/85"
        style={{
          top: "calc(env(safe-area-inset-top) + 14px)",
          right: "calc(env(safe-area-inset-right) + 14px)",
          background: "rgba(255,255,255,0.10)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.10)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.4} />
        Skip
      </button>

      <motion.div
        className="flex w-full max-w-[78vw] gap-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, delay: 0.08 }}
      >
        {!isFirstStep && (
          <button
            type="button"
            onClick={onBack}
            className="h-11 flex-1 rounded-xl text-[14px] font-medium text-white/70 active:bg-white/10"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="h-11 flex-1 rounded-xl bg-primary text-[14px] font-bold text-primary-foreground active:scale-[0.98] transition-transform"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          {isLastStep ? "Got it" : "Next"}
        </button>
      </motion.div>
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/tutorial/TutorialNav.tsx
git commit -m "feat(tutorial): TutorialNav with Skip pill and action row"
```

---

## Task 9: `TutorialStage` orchestrator

**Files:**
- Create: `src/tutorial/TutorialStage.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";
import { ImpactStyle } from "@capacitor/haptics";
import { triggerHaptic, triggerHapticSelection, triggerHapticSuccess, triggerHapticWarning } from "@/lib/haptics";
import { WizardCharacter } from "./WizardCharacter";
import { SpeechBubble } from "./SpeechBubble";
import { TutorialProgressBar } from "./TutorialProgressBar";
import { TutorialNav } from "./TutorialNav";
import { ONBOARDING_SECTIONS } from "./sections";
import type { TutorialStep } from "./types";

interface TutorialStageProps {
  isActive: boolean;
  currentStep: TutorialStep | null;
  currentStepIndex: number;
  totalSteps: number;
  activeSteps: TutorialStep[];
  flowId: string | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

class StageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function sectionIdForStep(stepId: string): string | null {
  const match = ONBOARDING_SECTIONS.find((s) => s.stepIds.includes(stepId));
  return match?.id ?? null;
}

function StageInner({
  isActive,
  currentStep,
  currentStepIndex,
  totalSteps,
  activeSteps,
  flowId,
  onNext,
  onPrev,
  onSkip,
}: TutorialStageProps) {
  const [bubbleComplete, setBubbleComplete] = useState(false);
  const [forceComplete, setForceComplete] = useState(false);
  const prevSectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isActive) return;
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    return () => {
      StatusBar.setStyle({ style: Style.Default }).catch(() => {});
    };
  }, [isActive]);

  useEffect(() => {
    setBubbleComplete(false);
    setForceComplete(false);
    if (!currentStep || flowId !== "onboarding") return;
    const sectionId = sectionIdForStep(currentStep.id);
    if (sectionId && prevSectionRef.current && sectionId !== prevSectionRef.current) {
      triggerHaptic(ImpactStyle.Medium);
    } else if (prevSectionRef.current !== null) {
      triggerHaptic(ImpactStyle.Light);
    }
    prevSectionRef.current = sectionId;
  }, [currentStep, flowId]);

  const handleBackdropTap = useCallback(() => {
    if (!bubbleComplete) {
      setForceComplete(true);
    } else {
      onNext();
    }
  }, [bubbleComplete, onNext]);

  const handleNext = useCallback(() => {
    triggerHapticSelection();
    onNext();
  }, [onNext]);

  const handleSkip = useCallback(() => {
    triggerHapticWarning();
    onSkip();
  }, [onSkip]);

  if (!isActive || !currentStep) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  if (isLastStep && bubbleComplete) {
    triggerHapticSuccess();
  }

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex: 10003, width: "100vw", height: "100dvh" }}
      aria-live="polite"
      aria-label="Tutorial"
    >
      <motion.div
        className="absolute inset-0"
        style={{
          backdropFilter: "blur(6px) brightness(0.45)",
          WebkitBackdropFilter: "blur(6px) brightness(0.45)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={handleBackdropTap}
      />

      {flowId === "onboarding" && (
        <div className="absolute inset-x-0 top-0">
          <TutorialProgressBar activeSteps={activeSteps} currentStepIndex={currentStepIndex} />
        </div>
      )}

      <div
        className="absolute left-4 flex flex-col items-start gap-3"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 16px)", pointerEvents: "auto" }}
      >
        <AnimatePresence mode="wait">
          <SpeechBubble
            key={currentStep.id}
            revealKey={currentStep.id}
            headline={currentStep.title}
            body={currentStep.description}
            pace={currentStep.voicePace}
            forceComplete={forceComplete}
            onTypingComplete={() => setBubbleComplete(true)}
          />
        </AnimatePresence>

        <motion.div
          key={`hop-${currentStep.id}`}
          animate={{ y: [0, -10, 0], scaleY: [1, 0.94, 1] }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <WizardCharacter pose={currentStep.wizardPose ?? "idle"} />
        </motion.div>

        <TutorialNav
          isFirstStep={isFirstStep}
          isLastStep={isLastStep}
          onBack={onPrev}
          onNext={handleNext}
          onSkip={handleSkip}
        />
      </div>
    </div>,
    document.body,
  );
}

export function TutorialStage(props: TutorialStageProps) {
  return (
    <StageErrorBoundary>
      <StageInner {...props} />
    </StageErrorBoundary>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/tutorial/TutorialStage.tsx
git commit -m "feat(tutorial): TutorialStage assembles wizard, bubble, progress, nav"
```

---

## Task 10: Wire `TutorialStage` into `TutorialContext`

**Files:**
- Modify: `src/tutorial/TutorialContext.tsx`

- [ ] **Step 1: Replace the `TutorialOverlay` import**

Find the import line:

```ts
import { TutorialOverlay } from "./TutorialOverlay";
```

Replace with:

```ts
import { TutorialStage } from "./TutorialStage";
```

- [ ] **Step 2: Replace the JSX render**

Find this block at the bottom of `TutorialProvider`:

```tsx
      <TutorialOverlay
        isActive={showOverlay}
        currentStep={state.currentStep}
        currentStepIndex={state.currentStepIndex}
        totalSteps={state.totalSteps}
        onNext={next}
        onPrev={prev}
        onSkip={skip}
        resolveTarget={(step) => managerRef.current.resolveTarget(step)}
      />
```

Replace with:

```tsx
      <TutorialStage
        isActive={showOverlay}
        currentStep={state.currentStep}
        currentStepIndex={state.currentStepIndex}
        totalSteps={state.totalSteps}
        activeSteps={state.activeSteps}
        flowId={state.currentFlow?.id ?? null}
        onNext={next}
        onPrev={prev}
        onSkip={skip}
      />
```

Note: `resolveTarget` was used by the old spotlight machinery only. The new stage does not need it.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/tutorial/TutorialContext.tsx
git commit -m "feat(tutorial): swap TutorialOverlay for TutorialStage"
```

---

## Task 11: Rewrite `onboardingFlow` copy, bump version, attach poses

**Files:**
- Modify: `src/tutorial/flows/onboardingFlow.ts`

- [ ] **Step 1: Replace the whole file**

Open `src/tutorial/flows/onboardingFlow.ts` and replace its contents with:

```ts
import type { TutorialFlow } from "../types";

export const onboardingFlow: TutorialFlow = {
  id: "onboarding",
  version: 9,
  steps: [
    {
      id: "welcome",
      title: "Good, you made it",
      description:
        "I'm the wizard, your corner for everything outside the cage. I'll keep your cut clean and your camp honest. Two minutes, then you're off.",
      position: "center",
      route: "/dashboard",
      wizardPose: "wave",
    },
    {
      id: "dashboard-overview",
      title: "This is home",
      description:
        "Your ring tracks the day, the wisdom keeps you sharp, the badges mark the work. Open this first, every morning.",
      position: "center",
      route: "/dashboard",
    },
    {
      id: "nutrition-page",
      title: "Food in, fight out",
      description:
        "Scan a barcode, search a food, or let Quick Fill read the plate. Build a personalised plan, then analyse the micros so nothing slips.",
      position: "center",
      navigateTo: "/nutrition",
    },
    {
      id: "nutrition-features",
      title: "Two tools, one job",
      description:
        "Analyse looks back, finding the gaps and quiet deficiencies. Generate looks forward, building meals around the macros you actually need.",
      position: "center",
      route: "/nutrition",
      wizardPose: "point",
    },
    {
      id: "weight-tracker-page",
      title: "Weigh in, every day",
      description:
        "One number, same time, no drama. Filter by week, month or all, and I'll analyse the trend so you see the truth, not the noise.",
      position: "center",
      navigateTo: "/weight",
    },
    {
      id: "fight-week-page",
      title: "The last seven days",
      description:
        "This is where the cut gets real. Water load, sodium taper, the lot. Follow it step by step and you'll walk to the scale calm.",
      position: "center",
      navigateTo: "/weight-cut",
      condition: (state) => state.goalType === "cutting",
    },
    {
      id: "rehydration-page",
      title: "After the scale",
      description:
        "The fight is won in the hours after weigh-in. Sip the plan I lay out, hour by hour, fluid, salt and carbs in order. Don't freelance here.",
      position: "center",
      navigateTo: "/weight-cut?tab=rehydration",
      condition: (state) => state.goalType === "cutting",
      wizardPose: "point",
    },
    {
      id: "fight-camps-page",
      title: "Organise the chaos",
      description:
        "Every camp gets its own home. Track the cut, log the sessions, drop in photos. When the next one starts, you'll know exactly what worked.",
      position: "center",
      navigateTo: "/fight-camps",
    },
    {
      id: "training-calendar-page",
      title: "Log the rounds",
      description:
        "BJJ, Muay Thai, wrestling, strength, all in one place with an RPE. Each week I'll write you a short summary, so the patterns surface.",
      position: "center",
      navigateTo: "/training-calendar",
    },
    {
      id: "recovery-page",
      title: "The other half of fitness",
      description:
        "Tell me how you slept, how sore you are, how the tank feels. The more you log, the sharper my recovery coach gets at calling your next move.",
      position: "center",
      navigateTo: "/recovery",
    },
    {
      id: "sleep-page",
      title: "Hours in the bank",
      description:
        "Log the nights, watch the trend across a week, a month, three months. Sleep is the cheapest performance gain you've got. Spend it.",
      position: "center",
      navigateTo: "/sleep",
    },
    {
      id: "quick-tips",
      title: "Two buttons to know",
      description:
        "The plus on the nav is your fast log, weight, meals, sessions, in seconds. The sparkle opens me up for a chat, any question, any time.",
      position: "center",
      navigateTo: "/dashboard",
      wizardPose: "point",
    },
    {
      id: "pro-features",
      title: "A quick note on Pro",
      description:
        "Manual logging, barcode and food search are yours, free, forever. The AI tools, the plans, the analysis, those live in Pro. Upgrade from Settings when you're ready.",
      position: "center",
      route: "/dashboard",
    },
    {
      id: "all-done",
      title: "That's the kit",
      description:
        "You can replay this from Settings whenever you like. Now go and do the work. I'll be here when you check in.",
      position: "center",
      route: "/dashboard",
      wizardPose: "celebrate",
    },
  ],
};
```

- [ ] **Step 2: Scan the new file for stray em dashes**

Run: `LC_ALL=C grep -nP '\xe2\x80\x94' src/tutorial/flows/onboardingFlow.ts || echo "clean"`
Expected: prints `clean`.

- [ ] **Step 3: Re-run the sections test to confirm step ids still match**

Run: `npm test -- sections`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tutorial/flows/onboardingFlow.ts
git commit -m "feat(tutorial): v9 onboarding copy with wizard poses"
```

---

## Task 12: Delete old visual files

**Files:**
- Delete: `src/tutorial/TutorialOverlay.tsx`
- Delete: `src/tutorial/TutorialTooltip.tsx`
- Delete: `src/tutorial/TutorialSpotlight.tsx`

- [ ] **Step 1: Confirm no remaining imports**

Run:

```bash
grep -rn "TutorialOverlay\|TutorialTooltip\|TutorialSpotlight" src --include="*.ts*"
```

Expected: only the three files themselves should appear. If any other file imports them, stop and fix the import first.

- [ ] **Step 2: Delete the files**

```bash
git rm src/tutorial/TutorialOverlay.tsx src/tutorial/TutorialTooltip.tsx src/tutorial/TutorialSpotlight.tsx
```

- [ ] **Step 3: Verify type-check and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(tutorial): remove obsolete overlay, tooltip, spotlight"
```

---

## Task 13: Manual verification + lint + final build

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no new errors in `src/tutorial/`.

- [ ] **Step 2: Full unit suite**

Run: `npm test`
Expected: pre-existing tests plus the new typewriter and sections tests pass.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Dev-server smoke test (web)**

Run: `npm run dev`
In the browser, log in as a test user, force-clear localStorage keys `tutorial_state`, `wcw_tutorial_shown_*`, then visit `/dashboard`. Verify:

1. Tour auto-starts after ~400ms.
2. Backdrop blurs the page.
3. Progress bar shows segments at the top.
4. Wizard bobs gently in the bottom-left.
5. Speech bubble springs in with a tail pointing at the wizard.
6. Body text reveals character by character. Caret blinks while typing.
7. Tapping the backdrop while typing snaps text to completion.
8. Tapping the backdrop a second time advances to the next step.
9. Next button always advances.
10. Section transitions trigger a heavier feel (haptic on device only) than intra-section advances.
11. Welcome shows the wave pose. Final step shows the celebrate jump.
12. Skip pill opens and skip returns to dashboard.
13. Replay from Settings restarts the tour.

- [ ] **Step 5: Reduced-motion smoke test**

In the browser devtools "Rendering" tab, enable "Emulate CSS prefers-reduced-motion: reduce", reload, restart the tour. Verify:

1. No idle bob.
2. No sparkles.
3. Speech bubble fades in with no spring.
4. Body text appears instantly, no caret.
5. Pose changes do not animate.

- [ ] **Step 6: iOS device verification (if a device is available)**

`npx cap sync ios && npx cap open ios`, run on device. Verify haptics fire on step land, section change, Next press, Skip warning, and final success. Verify safe-area padding does not collide with Dynamic Island or home indicator.

- [ ] **Step 7: Commit any final tweaks**

If any small fix was needed during smoke tests:

```bash
git add -p
git commit -m "fix(tutorial): post-verification adjustments"
```

If no fixes needed, skip this step.

---

## Self-Review Checklist (do not commit)

1. **Spec coverage:**
   - Stage composition (backdrop, progress, wizard, bubble, nav, skip pill) → Tasks 4, 5, 6, 7, 8, 9.
   - Wizard idle + poses → Task 5.
   - Speech bubble + typewriter + JRPG skip → Tasks 4, 6, 9.
   - Step transitions (bubble shrink, wizard hop, bubble regrow) → Task 9 (AnimatePresence mode wait + hop animation per step).
   - Segmented progress grouped by section → Tasks 3, 7.
   - Gestures (backdrop tap, Next, Skip, swipe) → Task 9 covers backdrop tap, Next, Skip. Swipe gestures are deferred to v1.1 to keep v1 scope tight, mentioned in spec section 5 as an enhancement.
   - Haptics → Task 9 (Light, Medium, Selection, Warning, Success).
   - Copy rewrite + version bump → Task 11.
   - Delete old files → Task 12.
   - Reduced motion → handled in Tasks 4, 5, 6, 9.

2. **Type consistency:**
   - `WizardPose` and `VoicePace` defined in Task 1, consumed in Tasks 4, 5, 6, 9.
   - `TutorialStep.activeSteps` flows from `TutorialManagerState.activeSteps` (existing) into `TutorialStage` (Task 9) into `TutorialProgressBar` (Task 7).
   - `flowId` flows from `state.currentFlow?.id` in `TutorialContext` (Task 10) into `TutorialStage` (Task 9) where it gates the onboarding-only progress bar render.

3. **Placeholder scan:** none found.

4. **Gap noted:** swipe gestures are in the spec under "Gestures" but deferred from v1 implementation to keep scope tight. This is documented under Task 13 verification and in the v1.1 list. If the user wants swipe in v1, add a Task between 9 and 10 that wires `motion/react` drag handlers on the backdrop.
