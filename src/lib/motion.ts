import type { Transition, Variants } from "motion/react";

/** Centralized spring configs — use instead of ad-hoc easing curves */
export const springs = {
  /** Buttons, toggles, nav indicator */
  snappy: { type: "spring", stiffness: 500, damping: 30, mass: 1 } as Transition,
  /** Cards, nav indicator */
  responsive: { type: "spring", stiffness: 300, damping: 28, mass: 1 } as Transition,
  /** Page transitions, content fade-in */
  gentle: { type: "spring", stiffness: 200, damping: 24, mass: 1 } as Transition,
  /** Celebrations, badge entrance */
  bouncy: { type: "spring", stiffness: 400, damping: 15, mass: 1 } as Transition,
};

/** Parent variant for staggered children entrance */
export function staggerContainer(staggerMs = 50, delayMs = 0): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerMs / 1000,
        delayChildren: delayMs / 1000,
      },
    },
  };
}

/** Child variant — fades up + slight scale */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1 },
};
