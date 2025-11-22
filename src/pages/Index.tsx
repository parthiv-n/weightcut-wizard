import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Shield, TrendingDown, Brain } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import wizardHero from "@/assets/wizard-hero.png";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Check if user has a profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", session.user.id)
          .maybeSingle();
        
        if (profile) {
          // User has profile, redirect to dashboard
          navigate("/dashboard");
        } else {
          // User authenticated but no profile, redirect to onboarding
          navigate("/onboarding");
        }
      }
    };
    
    checkAuthAndProfile();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-card">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="mx-auto mb-6">
            <img src={wizardHero} alt="Weight Cut Wizard" className="h-64 w-64 mx-auto object-contain" />
          </div>
          <h1 className="text-5xl md:text-6xl font-title font-bold mb-6 pb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Weight Cut Wizard
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Safe, science-based weight cutting for combat sports athletes. 
            AI-powered guidance to reach your weight class safely.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/auth")} className="text-lg px-8">
              Get Started
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth")} className="text-lg px-8">
              Sign In
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="text-center p-6 rounded-lg bg-card border">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Safe & Scientific</h3>
            <p className="text-muted-foreground">
              Built-in safety limits prevent dangerous weight cuts. Based on proven sports science.
            </p>
          </div>

          <div className="text-center p-6 rounded-lg bg-card border">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-secondary/10 mb-4">
              <Brain className="h-6 w-6 text-secondary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">AI-Powered</h3>
            <p className="text-muted-foreground">
              Personalized meal plans and guidance from your AI weight cut wizard.
            </p>
          </div>

          <div className="text-center p-6 rounded-lg bg-card border">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 mb-4">
              <TrendingDown className="h-6 w-6 text-accent" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Track Progress</h3>
            <p className="text-muted-foreground">
              Monitor weight, nutrition, hydration, and get ready for fight week.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
