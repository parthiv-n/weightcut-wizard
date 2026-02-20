import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { WizardLoader } from "@/components/ui/WizardLoader";
import wizardLogo from "@/assets/wizard-logo.png";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { userId, isLoading, authError, retryAuth } = useUser();

  if (isLoading) {
    return <WizardLoader message="Loading your profile..." />;
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative flex items-center justify-center w-28 h-28 opacity-50">
            <div className="relative rounded-full bg-primary/10 p-4">
              <img src={wizardLogo} alt="Wizard" className="w-16 h-16" />
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

  if (!userId) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
