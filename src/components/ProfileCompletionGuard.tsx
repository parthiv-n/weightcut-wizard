import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/UserContext";
import { WizardLoader } from "@/components/ui/WizardLoader";

export function ProfileCompletionGuard({ children }: { children: React.ReactNode }) {
  const { hasProfile, isLoading } = useAuth();

  if (isLoading) {
    return <WizardLoader message="Loading your profile..." />;
  }

  if (!hasProfile) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
