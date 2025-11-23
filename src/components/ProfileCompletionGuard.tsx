import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export function ProfileCompletionGuard({ children }: { children: React.ReactNode }) {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setHasProfile(false);
          setLoading(false);
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Error checking profile:", error);
          setHasProfile(false);
        } else {
          setHasProfile(!!profile);
        }
      } catch (error) {
        console.error("Error in ProfileCompletionGuard:", error);
        setHasProfile(false);
      } finally {
        setLoading(false);
      }
    };

    checkProfile();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If user doesn't have a profile, redirect to onboarding
  if (hasProfile === false) {
    return <Navigate to="/onboarding" replace />;
  }

  // If user has a profile, allow access
  return <>{children}</>;
}

