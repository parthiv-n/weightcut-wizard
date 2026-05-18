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
