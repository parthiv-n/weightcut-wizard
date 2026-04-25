import { motion } from "motion/react";

interface WizardLoaderProps {
  title?: string;
  message?: string;
}

export function WizardLoader({
  title = "FightCamp Wizard",
}: WizardLoaderProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      style={{ willChange: "opacity" }}
    >
      <p className="text-lg font-bold tracking-tight text-foreground">
        {title}<sup className="text-[9px] font-medium text-muted-foreground ml-0.5 align-super">TM</sup>
      </p>
    </motion.div>
  );
}
