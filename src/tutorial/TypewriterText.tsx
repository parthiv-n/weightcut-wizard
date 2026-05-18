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
    <span className="relative inline-block w-full align-baseline">
      <span aria-hidden className="invisible whitespace-pre-wrap">{text}</span>
      <span className="absolute inset-0 whitespace-pre-wrap">
        {text.slice(0, count)}
        {isTyping && !prefersReduced && (
          <span className="inline-block w-[2px] h-[1em] align-[-0.15em] ml-[1px] bg-current animate-pulse" />
        )}
      </span>
    </span>
  );
}
