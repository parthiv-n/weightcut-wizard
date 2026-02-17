import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { userId, isLoading, authError, retryAuth } = useUser();

  if (authError && !isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-lg font-medium">Something went wrong</p>
          <p className="text-muted-foreground text-sm">
            We couldn't connect. Check your internet and try again.
          </p>
          <Button onClick={retryAuth} variant="outline" size="lg">
            <RefreshCw className="h-4 w-4 mr-2" />
            Tap to retry
          </Button>
        </div>
      </div>
    );
  }

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
