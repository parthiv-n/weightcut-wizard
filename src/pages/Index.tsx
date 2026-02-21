import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, TrendingDown, Brain } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import wizardNutrition from "@/assets/wizard-nutrition.png";
import { useUser } from "@/contexts/UserContext";
import { WizardLoader } from "@/components/ui/WizardLoader";

const Index = () => {
  const navigate = useNavigate();
  const { userId, hasProfile, isLoading } = useUser();

  useEffect(() => {
    if (isLoading) return;

    if (userId) {
      if (hasProfile) {
        const lastRoute = localStorage.getItem('lastRoute');
        navigate(lastRoute || '/dashboard');
      } else {
        navigate("/onboarding");
      }
    }
  }, [userId, hasProfile, isLoading, navigate]);

  if (isLoading) {
    return <WizardLoader />;
  }

  return (
    <div className="min-h-screen bg-background dark:bg-gradient-to-br dark:from-[#120024] dark:via-[#05000f] dark:to-[#180636]">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="container mx-auto px-4 py-16">
        <div className="relative mx-auto mb-12 max-w-5xl">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-primary/10 via-background/50 to-secondary/10 shadow-[0_0_60px_rgba(168,85,247,0.4)] backdrop-blur-2xl" />
          <div className="relative z-10 px-6 py-10 md:px-10 md:py-12 flex flex-col items-center text-center gap-8">
            <div className="mx-auto mb-2 md:mb-4">
              <img
                src={wizardNutrition}
                alt="Weight Cut Wizard"
                className="h-24 w-24 md:h-32 md:w-32 mx-auto rounded-2xl object-contain shadow-xl shadow-purple-500/40 ring-2 ring-primary/40 bg-background/60"
              />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-title font-bold mb-4 tracking-tight leading-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Weight Cut Wizard
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto px-4">
                Safe, science-based weight cutting for combat sports athletes.
                AI-powered guidance to reach your weight class safely.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center px-6">
              <Button
                size="lg"
                onClick={() => navigate("/auth")}
                className="text-base h-12 px-8 rounded-full shadow-lg shadow-primary/30 bg-gradient-to-r from-primary to-secondary text-primary-foreground w-full sm:w-auto"
              >
                Get Started
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/auth")}
                className="text-base h-12 px-8 rounded-full w-full sm:w-auto border-white/20 bg-background/40 hover:bg-background/70 backdrop-blur-md"
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 max-w-5xl mx-auto">
          <div className="glass-card flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-br from-primary/5 via-background/40 to-secondary/5 backdrop-blur-xl border border-white/15 shadow-2xl text-left w-full transition-colors hover:border-primary/40">
            <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">Safe & Scientific</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Built-in safety limits prevent dangerous weight cuts. Based on proven sports science.
              </p>
            </div>
          </div>

          <div className="glass-card flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-br from-primary/5 via-background/40 to-secondary/5 backdrop-blur-xl border border-white/15 shadow-2xl text-left w-full transition-colors hover:border-primary/40">
            <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-secondary/10">
              <Brain className="h-6 w-6 text-secondary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">AI-Powered</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Personalized meal plans and guidance from your AI weight cut wizard.
              </p>
            </div>
          </div>

          <div className="glass-card flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-br from-primary/5 via-background/40 to-secondary/5 backdrop-blur-xl border border-white/15 shadow-2xl text-left w-full transition-colors hover:border-primary/40">
            <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-accent/10">
              <TrendingDown className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">Track Progress</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Monitor weight, nutrition, hydration, and get ready for fight week.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
