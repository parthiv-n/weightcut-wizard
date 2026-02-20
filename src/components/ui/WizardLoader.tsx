import wizardLogo from "@/assets/wizard-logo.png";

interface WizardLoaderProps {
  title?: string;
  message?: string;
}

export function WizardLoader({
  title = "WeightCut Wizard",
  message = "Preparing your data...",
}: WizardLoaderProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        {/* Logo with outer ping ring + inner glow ring */}
        <div className="relative flex items-center justify-center w-28 h-28">
          <div className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
          <div className="absolute inset-3 rounded-full border border-primary/20" />
          <div className="relative rounded-full bg-primary/10 p-4">
            <img src={wizardLogo} alt="Wizard" className="w-16 h-16" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="font-semibold text-base tracking-tight">{title}</p>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
      </div>
    </div>
  );
}
