import { Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAuth, useUser } from "@/contexts/UserContext";
import { WizardLoader } from "@/components/ui/WizardLoader";

export function ProfileCompletionGuard({ children }: { children: React.ReactNode }) {
  const { hasProfile, isLoading } = useAuth();
  const { profile } = useUser();
  const isCoach = profile?.role === "coach";

  // Coaches don't go through fighter onboarding — bounce them into /coach
  // (which is outside this guard). Athletes without a profile still go to /onboarding.
  if (!isLoading) {
    if (isCoach) return <Navigate to="/coach" replace />;
    if (!hasProfile) return <Navigate to="/onboarding" replace />;
  }

  // Keep both the splash and the real content mounted briefly so the transition
  // is a crossfade — no jarring swap when isLoading flips.
  return (
    <>
      <AnimatePresence mode="sync">
        {isLoading && <WizardLoader key="wizard-loader" />}
      </AnimatePresence>
      {!isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1], delay: 0.08 }}
          style={{ willChange: "opacity" }}
        >
          {children}
        </motion.div>
      )}
    </>
  );
}
