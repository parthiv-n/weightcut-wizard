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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-card">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="mx-auto mb-6 md:mb-8">
            <img src={wizardNutrition} alt="Weight Cut Wizard" className="h-32 w-32 md:h-48 md:w-48 mx-auto object-contain drop-shadow-xl" />
          </div>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-title font-bold mb-4 tracking-tight leading-tight bg-gradient-to-r from-primary via-white to-secondary bg-clip-text text-transparent">
            Weight Cut Wizard
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto px-4">
            Safe, science-based weight cutting for combat sports athletes.
            AI-powered guidance to reach your weight class safely.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center px-6">
            <Button size="lg" onClick={() => navigate("/auth")} className="text-base h-12 px-8 rounded-full shadow-lg shadow-primary/20 w-full sm:w-auto">
              Get Started
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth")} className="text-base h-12 px-8 rounded-full w-full sm:w-auto border-white/10 hover:bg-white/5 backdrop-blur-sm">
              Sign In
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-4 p-5 rounded-2xl bg-card/40 backdrop-blur-md border border-white/5 shadow-xl text-left w-full hover:bg-card/60 transition-colors">
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

          <div className="flex items-center gap-4 p-5 rounded-2xl bg-card/40 backdrop-blur-md border border-white/5 shadow-xl text-left w-full hover:bg-card/60 transition-colors">
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

          <div className="flex items-center gap-4 p-5 rounded-2xl bg-card/40 backdrop-blur-md border border-white/5 shadow-xl text-left w-full hover:bg-card/60 transition-colors">
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
