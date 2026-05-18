import { useEffect } from "react";
import { motion, useAnimation, useReducedMotion } from "motion/react";
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
  const pulseControls = useAnimation();

  useEffect(() => {
    pulseControls.set({ scale: 1 });
  }, [revealKey, pulseControls]);

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
      <motion.div animate={pulseControls}>
        <h3 className="text-base font-semibold leading-tight text-white">{headline}</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-white/85">
          <TypewriterText
            text={body}
            pace={pace}
            forceComplete={forceComplete}
            onComplete={onTypingComplete}
            onTick={(revealedSoFar) => {
              if (!prefersReduced && endsAtSentence(revealedSoFar)) {
                pulseControls.start({ scale: [1, 1.02, 1], transition: { duration: 0.12 } });
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
