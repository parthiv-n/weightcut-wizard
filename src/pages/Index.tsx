import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Activity, Utensils, Droplets, ChevronRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import wizardNutrition from "@/assets/wizard-nutrition.webp";
import { useAuth } from "@/contexts/UserContext";
import { WizardLoader } from "@/components/ui/WizardLoader";

const FEATURES = [
  {
    icon: Shield,
    title: "Safe Weight Cuts",
    desc: "Science-backed limits prevent dangerous cuts",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: Utensils,
    title: "AI Nutrition",
    desc: "Personalised meal plans & macro tracking",
    color: "text-green-400",
    bg: "bg-green-500/10",
  },
  {
    icon: Activity,
    title: "Fight Camp",
    desc: "Training load, recovery & fight week prep",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: Droplets,
    title: "Rehydration",
    desc: "Post weigh-in protocols backed by research",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
  },
];

const Index = () => {
  const navigate = useNavigate();
  const { userId, hasProfile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "true") {
      navigate("/auth?reset=true");
      return;
    }
    if (userId) {
      if (hasProfile) {
        const lastRoute = localStorage.getItem("lastRoute");
        navigate(lastRoute && lastRoute !== "/wizard" ? lastRoute : "/dashboard");
      } else {
        navigate("/onboarding");
      }
    }
  }, [userId, hasProfile, isLoading, navigate]);

  const [exiting, setExiting] = useState(false);

  const navigateWithTransition = useCallback((path: string) => {
    setExiting(true);
    setTimeout(() => navigate(path), 250);
  }, [navigate]);

  if (isLoading || userId) {
    return <WizardLoader />;
  }

  return (
    <div className="min-h-screen bg-background dark:bg-[#020204] text-foreground flex flex-col">
      {/* Top bar */}
      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-50">
        <ThemeToggle />
      </div>

      {/* Hero */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-8 transition-all duration-[250ms] ease-out"
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

        {/* Headline */}
        <h1 className="text-[28px] font-extrabold tracking-tight text-center leading-tight mb-2">
          <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            FightCamp Wizard
          </span>
        </h1>
        <p className="text-[15px] text-muted-foreground text-center max-w-[300px] leading-relaxed mb-8">
          Safe, science-based weight cutting for combat sport athletes
        </p>

        {/* CTA buttons */}
        <div className="w-full max-w-[320px] space-y-3 mb-10">
          <button
            onClick={() => navigateWithTransition("/auth?mode=signup")}
            disabled={exiting}
            className="w-full h-[52px] rounded-2xl bg-primary text-primary-foreground font-bold text-[16px] flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-70"
          >
            Get Started
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigateWithTransition("/auth")}
            disabled={exiting}
            className="w-full h-[52px] rounded-2xl border border-border/60 text-foreground font-semibold text-[15px] flex items-center justify-center active:scale-[0.97] transition-transform hover:bg-muted/30 disabled:opacity-70"
          >
            I already have an account
          </button>
        </div>

        {/* Feature grid */}
        <div className="w-full max-w-[360px] grid grid-cols-2 gap-2.5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border/30 dark:border-white/[0.06] bg-card/50 dark:bg-white/[0.03] p-3.5"
            >
              <div className={`h-9 w-9 rounded-xl ${f.bg} flex items-center justify-center mb-2.5`}>
                <f.icon className={`h-4 w-4 ${f.color}`} />
              </div>
              <p className="text-[13px] font-semibold leading-tight mb-0.5">{f.title}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[11px] text-muted-foreground/60">
        <button onClick={() => navigate("/legal?tab=privacy")} className="hover:text-foreground transition-colors">
          Privacy
        </button>
        <span>·</span>
        <button onClick={() => navigate("/legal?tab=terms")} className="hover:text-foreground transition-colors">
          Terms
        </button>
      </div>
    </div>
  );
};

export default Index;
