import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { WizardLoader } from "@/components/ui/WizardLoader";

export function ProfileCompletionGuard({ children }: { children: React.ReactNode }) {
  const { hasProfile, isLoading } = useUser();

  if (isLoading) {
    return <WizardLoader message="Loading your profile..." />;
  }

  if (!hasProfile) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
