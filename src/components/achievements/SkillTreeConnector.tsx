import { motion } from "motion/react";

interface SkillTreeConnectorProps {
  topUnlocked: boolean;
  bottomUnlocked: boolean;
  globalIndex: number;
}

export function SkillTreeConnector({ topUnlocked, bottomUnlocked, globalIndex }: SkillTreeConnectorProps) {
  const bothUnlocked = topUnlocked && bottomUnlocked;

  return (
    <div className="flex justify-center">
      <svg width="4" height="32" viewBox="0 0 4 32" fill="none">
        {/* Background track */}
        <path d="M2 0 L2 32" stroke="hsl(var(--border))" strokeWidth="2" strokeLinecap="round" />
        {/* Green overlay when both nodes unlocked */}
        {bothUnlocked && (
          <motion.path
            d="M2 0 L2 32"
            stroke="rgb(34 197 94)"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: globalIndex * 0.05 + 0.15, ease: [0.32, 0.72, 0, 1] }}
          />
        )}
      </svg>
    </div>
  );
}
