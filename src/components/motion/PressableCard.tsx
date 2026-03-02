import { motion, useReducedMotion } from "motion/react";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { springs } from "@/lib/motion";
import type { HTMLMotionProps } from "motion/react";

interface PressableCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
}

export function PressableCard({ children, className, onTap, ...rest }: PressableCardProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
      transition={springs.snappy}
      onTap={(e, info) => {
        triggerHaptic(ImpactStyle.Light);
        onTap?.(e, info);
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
