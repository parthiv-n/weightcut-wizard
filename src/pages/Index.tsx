import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Flame,
  Brain,
  Utensils,
  Droplets,
  Activity,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import wizardNutrition from "@/assets/wizard-nutrition.webp";
import { useAuth, useUser } from "@/contexts/UserContext";
import { WizardLoader } from "@/components/ui/WizardLoader";
import { supabase } from "@/integrations/supabase/client";

const FEATURES = [
  { icon: Flame, label: "Weight Management" },
  { icon: Brain, label: "AI Game Plans" },
  { icon: Utensils, label: "Meal Planning" },
  { icon: Droplets, label: "Rehydration" },
  { icon: Activity, label: "Fight Camp" },
  { icon: Target, label: "Macro Tracking" },
  { icon: TrendingUp, label: "Performance" },
  { icon: Zap, label: "Recovery" },
];

const Index = () => {
  const navigate = useNavigate();
  const { userId, hasProfile, isLoading } = useAuth();
  const { profile } = useUser();

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "true") {
      navigate("/auth?reset=true");
      return;
    }
    if (userId) {
      // Warm critical edge functions in parallel with route transition (saves
      // 500-800ms on dashboard first paint vs warming after mount).
      supabase.functions.invoke("daily-wisdom", { method: "GET" } as any).catch(() => {});

      // Coach users skip fighter onboarding entirely.
      const intendedRole = (() => {
        try { return localStorage.getItem("wcw_intended_role"); } catch { return null; }
      })();
      const isCoach = profile?.role === "coach" || intendedRole === "coach";
      if (isCoach) {
        navigate("/coach");
        return;
      }
      if (hasProfile) {
        const lastRoute = localStorage.getItem("lastRoute");
        navigate(lastRoute && lastRoute !== "/wizard" ? lastRoute : "/dashboard");
      } else {
        navigate("/onboarding");
      }
    }
  }, [userId, hasProfile, isLoading, profile?.role, navigate]);

  const [exiting, setExiting] = useState(false);

  const navigateWithTransition = useCallback(
    (path: string) => {
      setExiting(true);
      setTimeout(() => navigate(path), 250);
    },
    [navigate],
  );

  if (isLoading || userId) {
    return <WizardLoader />;
  }

  return (
    <div className="min-h-screen bg-background dark:bg-[#020204] text-foreground flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-50">
        <ThemeToggle />
      </div>

      {/* Content */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8 transition-all duration-[250ms] ease-out"
        style={{
          opacity: exiting ? 0 : 1,
          transform: exiting ? "scale(0.97) translateY(-8px)" : "scale(1) translateY(0)",
        }}
      >
        {/* Logo */}
        <img
          src={wizardNutrition}
          alt="FightCamp Wizard"
          className="h-24 w-24 rounded-2xl object-contain ring-1 ring-primary/20 bg-background/50 p-1 mb-6"
        />

        {/* Scrolling marquee headline */}
        <div className="w-screen mb-6 overflow-hidden select-none" aria-hidden="true">
          <div className="animate-marquee flex whitespace-nowrap">
            {[...Array(4)].map((_, i) => (
              <span
                key={i}
                className="text-[56px] sm:text-[72px] font-black uppercase tracking-tighter text-foreground dark:text-white mx-6"
                style={{ fontStretch: "condensed" }}
              >
                FightCamp Wizard
              </span>
            ))}
          </div>
        </div>

        {/* Accessible hidden h1 */}
        <h1 className="sr-only">FightCamp Wizard</h1>

        {/* Tagline */}
        <p className="text-[15px] text-muted-foreground text-center max-w-[320px] leading-relaxed mb-10">
          Your AI-powered companion for peak athletic performance
        </p>

        {/* CTA buttons */}
        <div className="w-full max-w-[320px] space-y-3 mb-10">
          <button
            onClick={() => navigateWithTransition("/auth?mode=signup")}
            disabled={exiting}
            className="w-full h-[54px] rounded-2xl bg-primary text-primary-foreground font-bold text-[16px] flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-70"
          >
            Get Started
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigateWithTransition("/auth")}
            disabled={exiting}
            className="w-full h-[54px] rounded-2xl border border-border text-foreground font-semibold text-[15px] flex items-center justify-center active:scale-[0.97] transition-transform hover:bg-muted/30 disabled:opacity-70"
          >
            I already have an account
          </button>
        </div>

        {/* Feature list — compact 2-col grid */}
        <div className="w-full max-w-[360px] grid grid-cols-2 gap-x-4 gap-y-3">
          {FEATURES.map((f) => (
            <div key={f.label} className="flex items-center justify-center gap-2.5">
              <f.icon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-[13px] font-medium text-foreground/80">{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[11px] text-muted-foreground/60">
        <button
          onClick={() => navigate("/legal?tab=privacy")}
          className="hover:text-foreground transition-colors"
        >
          Privacy
        </button>
        <span>·</span>
        <button
          onClick={() => navigate("/legal?tab=terms")}
          className="hover:text-foreground transition-colors"
        >
          Terms
        </button>
      </div>
    </div>
  );
};

export default Index;
