interface WizardLoaderProps {
  title?: string;
  message?: string;
}

export function WizardLoader({
  title = "FightCamp Wizard",
}: WizardLoaderProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background animate-[splashFadeIn_0.4s_ease-out_both]">
      <p className="text-lg font-bold tracking-tight text-foreground">
        {title}<sup className="text-[9px] font-medium text-muted-foreground ml-0.5 align-super">TM</sup>
      </p>
    </div>
  );
}
