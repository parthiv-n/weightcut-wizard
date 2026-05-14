import { useEffect, useState, useCallback, type SVGProps, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ThemeToggle } from "@/components/ThemeToggle";
import wizardNutrition from "@/assets/wizard-nutrition.webp";
import { useAuth } from "@/contexts/UserContext";
import { WizardLoader } from "@/components/ui/WizardLoader";

const FEATURE_ROTATE_MS = 2200;

// Cold-start grace period: Convex auth can briefly report
// `{ isLoading: false, isAuthenticated: false }` between mount and
// session restoration for a returning user. Without this guard, the
// landing CTA would flash for a frame in that window between the splash
// fade and the dashboard. We hold the splash for this long on first paint.
const BOOT_GRACE_MS = 1200;

// SF-Symbols-inspired feature glyphs — single-stroke, rounded caps, balanced
// proportions. Hand-rolled inline so the set feels bespoke rather than the
// default lucide icons that show up in every AI-generated app.
type IconProps = SVGProps<SVGSVGElement>;
const IconBase = ({ className, children, ...rest }: IconProps & { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

const ScaleIcon = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="3" y="6" width="18" height="14" rx="3.2" />
    <rect x="9" y="9" width="6" height="3" rx="0.6" />
    <path d="M8 16.5h8" />
  </IconBase>
);

const SparklesIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M12 3l1.4 4.6 4.6 1.4-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4z" />
    <path d="M18.5 14.5l.45 1.55 1.55.45-1.55.45-.45 1.55-.45-1.55-1.55-.45 1.55-.45z" />
    <path d="M5.5 15.5l.4 1.35 1.35.4-1.35.4-.4 1.35-.4-1.35-1.35-.4 1.35-.4z" />
  </IconBase>
);

const ForkKnifeIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M8 3v6" />
    <path d="M11 3v6" />
    <path d="M8 9a3 3 0 0 0 3-3" />
    <path d="M9.5 9v12" />
    <path d="M16 3v18" />
    <path d="M16 3c-1.6 1-2.6 3-2.6 5.6S14.4 13 16 13" />
  </IconBase>
);

const DropIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M12 3.5c-2.5 3.2-6 7.4-6 11.2A6 6 0 0 0 18 14.7c0-3.8-3.5-8-6-11.2z" />
    <path d="M8.8 14.6c.2 1.6 1.4 2.9 3 3.1" />
  </IconBase>
);

const StopwatchIcon = (p: IconProps) => (
  <IconBase {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 1.5" />
    <path d="M9.5 3h5" />
    <path d="M12 3v2.5" />
    <path d="M18.5 6.5l1.5 1.5" />
  </IconBase>
);

const DonutIcon = (p: IconProps) => (
  <IconBase {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4v8h8" />
  </IconBase>
);

const GaugeIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M3.5 16.5a8.5 8.5 0 0 1 17 0" />
    <path d="M12 16.5L16.5 10" />
    <circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
  </IconBase>
);

const MoonIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M20.5 14.5A8 8 0 1 1 9.5 3.5a6 6 0 0 0 11 11z" />
  </IconBase>
);

const FEATURES = [
  { icon: ScaleIcon, label: "Weight Management" },
  { icon: SparklesIcon, label: "AI Game Plans" },
  { icon: ForkKnifeIcon, label: "Meal Planning" },
  { icon: DropIcon, label: "Rehydration" },
  { icon: StopwatchIcon, label: "Fight Camp" },
  { icon: DonutIcon, label: "Macro Tracking" },
  { icon: GaugeIcon, label: "Performance" },
  { icon: MoonIcon, label: "Recovery" },
];

const Index = () => {
  const navigate = useNavigate();
  const { userId, hasProfile, isLoading, isCoach } = useAuth();

  // Hold the splash for a brief window even when auth has "settled" to
  // no-session — Convex can flicker through that state on cold start
  // before restoring a returning user's session.
  const [bootGraceExpired, setBootGraceExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBootGraceExpired(true), BOOT_GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "true") {
      navigate("/auth?reset=true");
      return;
    }
    if (userId) {
      // Convex actions don't need warmup — co-located with deployment.
      if (isCoach) {
        // Don't honour an athlete-side lastRoute for a coach
        navigate("/coach", { replace: true });
        return;
      }
      // Fighters always land on /dashboard from cold start.
      // RouteTracker still writes lastRoute for in-app navigation, but the
      // splash explicitly resolves to /dashboard so users land on a known
      // surface every launch.
      if (hasProfile) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/onboarding", { replace: true });
      }
    }
  }, [userId, hasProfile, isLoading, isCoach, navigate]);

  const [exiting, setExiting] = useState(false);

  const navigateWithTransition = useCallback(
    (path: string) => {
      setExiting(true);
      setTimeout(() => navigate(path), 250);
    },
    [navigate],
  );

  // Cycle through features — one big icon + label at a time, fading
  // between each. Honour the reduced-motion preference: hold on the
  // first feature instead of auto-advancing.
  const prefersReducedMotion = useReducedMotion();
  const [featureIndex, setFeatureIndex] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion) return;
    const t = setInterval(() => {
      setFeatureIndex((i) => (i + 1) % FEATURES.length);
    }, FEATURE_ROTATE_MS);
    return () => clearInterval(t);
  }, [prefersReducedMotion]);
  const currentFeature = FEATURES[featureIndex];
  const FeatureIcon = currentFeature.icon;

  if (isLoading || userId || !bootGraceExpired) {
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
          <button
            onClick={() => navigateWithTransition("/coach/login")}
            disabled={exiting}
            className="w-full text-center text-[12px] text-muted-foreground/70 hover:text-muted-foreground transition-colors py-1 disabled:opacity-50"
          >
            I'm a coach →
          </button>
        </div>

        {/* Feature spotlight — rotating slideshow, one big icon + label at a time */}
        <div
          className="w-full max-w-[360px] h-[132px] relative flex items-center justify-center"
          aria-live="polite"
          aria-atomic="true"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentFeature.label}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            >
              <div className="h-16 w-16 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                <FeatureIcon className="h-9 w-9 text-primary" />
              </div>
              <span className="text-[19px] font-semibold tracking-tight text-foreground">
                {currentFeature.label}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center gap-1.5 mt-3" aria-hidden="true">
          {FEATURES.map((f, i) => (
            <span
              key={f.label}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === featureIndex ? "w-4 bg-primary" : "w-1 bg-foreground/20"
              }`}
            />
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
