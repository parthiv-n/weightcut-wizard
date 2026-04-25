import { Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { WizardLoader } from "@/components/ui/WizardLoader";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { userId, isLoading, authError, retryAuth } = useAuth();

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative flex items-center justify-center w-28 h-28 opacity-50">
            <div className="rounded-2xl bg-primary/10 p-4">
              <AlertTriangle className="h-10 w-10 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-base font-semibold">Couldn't connect</p>
            <p className="text-sm text-muted-foreground">Check your internet and try again.</p>
          </div>
          <Button onClick={retryAuth} variant="outline" size="lg">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!isLoading && !userId) {
    return <Navigate to="/auth" replace />;
  }

  // Crossfade between splash and real content so auth resolution is seamless.
  return (
    <>
      <AnimatePresence mode="sync">
        {isLoading && <WizardLoader key="wizard-loader" />}
      </AnimatePresence>
      {!isLoading && userId && (
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
