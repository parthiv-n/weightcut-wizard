import type { Transition, Variants } from "motion/react";
import { isNativePlatform } from "@/hooks/useIsNative";

/** Centralized spring configs — use instead of ad-hoc easing curves */
export const springs = isNativePlatform
  ? {
      snappy: { duration: 0.15, ease: "easeOut" } as Transition,
      responsive: { duration: 0.2, ease: "easeOut" } as Transition,
      gentle: { duration: 0.25, ease: "easeOut" } as Transition,
      bouncy: { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] } as Transition,
    }
  : {
      snappy: { type: "spring", stiffness: 500, damping: 30, mass: 1 } as Transition,
      responsive: { type: "spring", stiffness: 300, damping: 28, mass: 1 } as Transition,
      gentle: { type: "spring", stiffness: 200, damping: 24, mass: 1 } as Transition,
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
export const staggerItem: Variants = isNativePlatform
  ? {
      hidden: { opacity: 0, y: 16 },
      visible: { opacity: 1, y: 0 },
    }
  : {
      hidden: { opacity: 0, y: 16, scale: 0.97 },
      visible: { opacity: 1, y: 0, scale: 1 },
    };
