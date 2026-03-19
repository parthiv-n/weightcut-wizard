import { useState, useEffect } from "react";
import wizardLogo from "@/assets/wizard-logo.webp";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface WizardLoaderProps {
  title?: string;
  message?: string;
}

export function WizardLoader({
  title = "WeightCut Wizard",
  message = "Preparing your data...",
}: WizardLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [showRefresh, setShowRefresh] = useState(false);

  useEffect(() => {
    // Fast start, gradual slowdown — feels snappy
    const timer = setInterval(() => {
      setProgress((old) => {
        if (old < 30) return old + 4;          // 0-30%: fast ramp
        if (old < 60) return old + 2.5;        // 30-60%: steady
        if (old < 80) return old + 1;          // 60-80%: slowing
        const diff = 92 - old;
        return Math.min(92, old + Math.max(0.3, diff * 0.08)); // 80-92%: crawl
      });
    }, 100);

    // Show force refresh button after 4 seconds if still loading
    const refreshTimer = setTimeout(() => {
      setShowRefresh(true);
    }, 4000);

    return () => {
      clearInterval(timer);
      clearTimeout(refreshTimer);
    };
  }, []);

  const handleForceRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        {/* Logo with outer ping ring + inner glow ring */}
        <div className="relative flex items-center justify-center w-28 h-28">
          <div className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
          <div className="absolute inset-3 rounded-full border border-primary/20" />
          <div className="relative rounded-full bg-primary/10 p-4">
            <img src={wizardLogo} alt="Wizard" className="w-16 h-16 rounded-full object-cover" />
          </div>
        </div>

        <div className="w-full text-center space-y-4">
          <div className="space-y-1">
            <p className="font-semibold text-lg tracking-tight">{title}</p>
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
          </div>

          <Progress
            value={progress}
            className="h-2 w-full max-w-[200px] mx-auto"
            indicatorClassName="bg-gradient-to-r from-primary via-primary/60 to-primary bg-[length:200%_100%] animate-[progressShimmer_1.5s_ease-in-out_infinite]"
          />
        </div>

        {/* Force refresh button - fades in after a delay to resolve connection hangs */}
        <div className={`transition-opacity duration-1000 ${showRefresh ? "opacity-100" : "opacity-0 pointer-events-none"} flex flex-col items-center gap-2`}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleForceRefresh}
            className="text-xs text-muted-foreground"
          >
            <RefreshCw className="mr-2 h-3 w-3" />
            Force Refresh
          </Button>
          <p className="text-[10px] text-muted-foreground/60 text-center max-w-[200px]">
            Taking longer than usual? Try refreshing.
          </p>
        </div>
      </div>
    </div>
  );
}
