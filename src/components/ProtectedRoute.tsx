import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { userId, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!userId) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
