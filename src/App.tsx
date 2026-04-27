import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ProfileCompletionGuard } from "@/components/ProfileCompletionGuard";
import { UserProvider } from "@/contexts/UserContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { WizardBackgroundProvider } from "@/contexts/WizardBackgroundContext";
import { AITaskProvider } from "@/contexts/AITaskContext";
import { PaywallOverlay } from "@/components/subscription/PaywallOverlay";
import { NoGemsOverlay } from "@/components/subscription/NoGemsOverlay";
import { GlobalLoadingOverlay } from "@/components/GlobalLoadingOverlay";
import { PageTransition } from "@/components/PageTransition";
import { NavigationDirectionProvider } from "@/hooks/useNavigationDirection";
import { TutorialProvider } from "@/tutorial/TutorialContext";
import { BottomNav } from "@/components/BottomNav";
import { FloatingWizardChat } from "@/components/FloatingWizardChat";
const FloatingWorkoutIndicator = lazy(() => import("@/components/gym/FloatingWorkoutIndicator").then(m => ({ default: m.FloatingWorkoutIndicator })));
const AIFloatingIndicator = lazy(() => import("@/components/AIFloatingIndicator").then(m => ({ default: m.AIFloatingIndicator })));
import * as Sentry from "@sentry/react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DashboardSkeleton, NutritionPageSkeleton, WeightTrackerSkeleton, GoalsSkeleton } from "@/components/ui/skeleton-loader";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PullToRefresh } from "@/components/PullToRefresh";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Goals = lazy(() => import("./pages/Goals"));
const Nutrition = lazy(() => import("./pages/nutrition/NutritionPage"));
const WeightTracker = lazy(() => import("./pages/WeightTracker"));
const WeightCut = lazy(() => import("./pages/WeightCut"));
const FightCamps = lazy(() => import("./pages/FightCamps"));
const FightCampDetail = lazy(() => import("./pages/FightCampDetail"));
const TrainingCalendar = lazy(() => import("./pages/TrainingCalendar"));
const Recovery = lazy(() => import("./pages/Recovery"));
const Sleep = lazy(() => import("./pages/Sleep"));
// const SkillTree = lazy(() => import("./pages/SkillTree"));
const GymTracker = lazy(() => import("./pages/GymTracker"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CutPlanReview = lazy(() => import("./pages/CutPlanReview"));
const Legal = lazy(() => import("./pages/Legal"));
const CoachDashboard = lazy(() => import("./pages/coach/CoachDashboard"));
const CoachSetup = lazy(() => import("./pages/coach/CoachSetup"));
const CoachLogin = lazy(() => import("./pages/coach/CoachLogin"));
const AthleteDetail = lazy(() => import("./pages/coach/AthleteDetail"));
const JoinGym = lazy(() => import("./pages/JoinGym"));
const MyGym = lazy(() => import("./pages/MyGym"));

// Prioritized idle preloading — critical routes first, rest deferred
const _idle = window.requestIdleCallback || ((cb: IdleRequestCallback) => setTimeout(cb, 50));
_idle(() => {
  // Primary routes — likely first navigation
  import("./pages/Dashboard").catch(() => {});
  import("./pages/nutrition/NutritionPage").catch(() => {});
  import("./pages/WeightTracker").catch(() => {});
  // Secondary routes — defer to avoid network contention
  setTimeout(() => {
    import("./pages/Goals").catch(() => {});
    import("./pages/WeightCut").catch(() => {});
    import("./pages/GymTracker").catch(() => {});
    import("./pages/TrainingCalendar").catch(() => {});
    import("./pages/MyGym").catch(() => {});
    import("./pages/JoinGym").catch(() => {});
    import("./pages/coach/CoachLogin").catch(() => {});
  }, 3000);
  setTimeout(() => {
    import("./pages/Recovery").catch(() => {});
    import("./pages/FightCamps").catch(() => {});
    import("./pages/FightCampDetail").catch(() => {});
  }, 6000);
});

// Warm up the heaviest AI edge functions on idle so the first real call doesn't
// pay a 2-3s cold-start. We send a GET ping (no body, no auth) — functions
// short-circuit to a small response without doing real work. Anything that
// fails is silent: warmup is best-effort.
const SUPABASE_URL_FOR_WARMUP = import.meta.env.VITE_SUPABASE_URL;
if (SUPABASE_URL_FOR_WARMUP) {
  setTimeout(() => {
    const fns = [
      "meal-planner",
      "generate-cut-plan",
      "fight-week-analysis",
      "training-insights",
      "hydration-insights",
    ];
    for (const fn of fns) {
      fetch(`${SUPABASE_URL_FOR_WARMUP}/functions/v1/${fn}`, {
        method: "GET",
        keepalive: true,
      }).catch(() => {});
    }
  }, 4500);
}

const queryClient = new QueryClient();

const SKIP_ROUTES = ['/', '/auth', '/onboarding', '/legal'];

import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

function RouteTracker() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!SKIP_ROUTES.includes(location.pathname)) {
      localStorage.setItem('lastRoute', location.pathname);
    }
  }, [location.pathname]);

  // Set light status bar text for dark background + initialize AdMob
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark });
      document.documentElement.classList.add("native-app");
      import("@/lib/admob").then(({ initializeAdMob }) => initializeAdMob()).catch(() => {});
    }
  }, []);

  // Handle Deep Links (Supabase Auth)
  useEffect(() => {
    CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      logger.info('App opened with URL', { url });

      // 1. Handle Supabase Auth (PKCE Code)
      if (url.includes('code=')) {
        try {
          const params = new URLSearchParams(new URL(url).search);
          const code = params.get('code');
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error) {
              // Valid session estalished
              // If we have a specific path in the URL, go there, otherwise dashboard
              const path = url.split("weightcutwizard://")[1]?.split('?')[0];
              if (path && path.length > 0 && path !== 'callback') {
                navigate(`/${path}`);
              } else {
                navigate('/dashboard');
              }
            }
          }
        } catch (e) {
          logger.error("Error exchanging code", e);
        }
        return; // specific auth handling done
      }

      // 2. Handle Supabase Auth (Implicit Flow / Hash Fragment)
      if (url.includes('#access_token') || url.includes('&access_token')) {
        try {
          // Supabase client might handle this if it detects the hash, 
          // but we can force a session check or navigation
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            navigate('/dashboard');
          }
        } catch (e) {
          logger.error("Error handling implicit flow", e);
        }
        return;
      }

      // 3. Generic Deep Linking (weightcutwizard://page)
      // e.g. weightcutwizard://nutrition -> /nutrition
      if (url.includes('weightcutwizard://')) {
        const slug = url.split("weightcutwizard://")[1];
        if (slug) {
          const [path, queryString] = slug.split('?');
          // Preserve ?reset=true for password reset deep links
          const params = new URLSearchParams(queryString || '');
          const suffix = params.get('reset') === 'true' ? '?reset=true' : '';

          // special case: 'callback' is often used for auth redirects, ignore it if we didn't match auth above
          if (path !== 'callback') {
            navigate(`/${path}${suffix}`);
          } else {
            // callback without code? maybe just go to dashboard
            navigate('/dashboard');
          }
        }
      }
    });
  }, [navigate]);

  return null;
}

const AppLayoutContent = () => {
  const { openMobile } = useSidebar();

  return (
    <>
      {/* Mobile-first layout: sidebar hidden on mobile, shown on desktop */}
      <div className="min-h-screen-safe flex w-full no-horizontal-scroll">
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        {/* Main content area - responsive padding for mobile */}
        <div className="flex-1 flex flex-col min-w-0 w-full">
          {/* Desktop-only header with sidebar trigger and theme toggle */}
          <header className="hidden md:flex sticky top-0 z-50 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 items-center justify-between px-4 md:static md:z-auto">
            <SidebarTrigger className="touch-target" />
            <ThemeToggle className="touch-target" />
          </header>
          <OfflineBanner />
          {/* Main content with mobile-first responsive padding - bottom padding for bottom nav */}
          <main className="flex-1 overflow-auto overflow-x-hidden relative min-h-0 w-full pt-2 md:pb-0 safe-area-inset-top safe-area-inset-left safe-area-inset-right animate-app-content-in" style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}>
            <PullToRefresh />
            <PageTransition>
              <Suspense fallback={null}>
                <Outlet />
              </Suspense>
            </PageTransition>
          </main>
        </div>
      </div>
      {/* Bottom Navigation - Mobile Only */}
      <BottomNav />
      <Suspense fallback={null}><FloatingWorkoutIndicator /></Suspense>
      <Suspense fallback={null}><AIFloatingIndicator /></Suspense>
      <FloatingWizardChat />
    </>
  );
};

const AppLayout = () => (
  <SidebarProvider>
    <AppLayoutContent />
  </SidebarProvider>
);

const ProtectedAppLayout = () => (
  <ProtectedRoute>
    <ProfileCompletionGuard>
      <AppLayout />
    </ProfileCompletionGuard>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ErrorBoundary onError={(error, errorInfo) => {
        Sentry.captureException(error, {
          extra: { componentStack: errorInfo.componentStack },
        });
      }}>
        <UserProvider>
          <SubscriptionProvider>
          <AITaskProvider>
          <WizardBackgroundProvider>
            <Toaster />
            <Sonner />
            <PaywallOverlay />
            <NoGemsOverlay />
            <GlobalLoadingOverlay />
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <NavigationDirectionProvider>
              <TutorialProvider>
              <RouteTracker />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/coach/login" element={<Suspense fallback={<DashboardSkeleton />}><CoachLogin /></Suspense>} />
                <Route path="/legal" element={<Suspense fallback={null}><Legal /></Suspense>} />
                <Route path="/onboarding" element={
                  <ProtectedRoute>
                    <Onboarding />
                  </ProtectedRoute>
                } />
                <Route path="/cut-plan" element={
                  <ProtectedRoute>
                    <Suspense fallback={null}><CutPlanReview /></Suspense>
                  </ProtectedRoute>
                } />

                {/* Coach Mode routes — outside the ProfileCompletionGuard,
                    coaches don't go through fighter onboarding. */}
                <Route path="/coach/setup" element={
                  <ProtectedRoute>
                    <Suspense fallback={null}><CoachSetup /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/coach" element={
                  <ProtectedRoute>
                    <Suspense fallback={<DashboardSkeleton />}><CoachDashboard /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/coach/athletes/:id" element={
                  <ProtectedRoute>
                    <Suspense fallback={<DashboardSkeleton />}><AthleteDetail /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/join" element={
                  <ProtectedRoute>
                    <Suspense fallback={null}><JoinGym /></Suspense>
                  </ProtectedRoute>
                } />

                {/* Shared layout route — AppLayout persists across all child navigations */}
                <Route element={<ProtectedAppLayout />}>
                  <Route path="/dashboard" element={<ErrorBoundary><Suspense fallback={<DashboardSkeleton />}><Dashboard /></Suspense></ErrorBoundary>} />
                  <Route path="/goals" element={<ErrorBoundary><Suspense fallback={<GoalsSkeleton />}><Goals /></Suspense></ErrorBoundary>} />
                  <Route path="/nutrition" element={<ErrorBoundary><Suspense fallback={<NutritionPageSkeleton />}><Nutrition /></Suspense></ErrorBoundary>} />
                  <Route path="/weight" element={<ErrorBoundary><Suspense fallback={<WeightTrackerSkeleton />}><WeightTracker /></Suspense></ErrorBoundary>} />
                  <Route path="/weight-cut" element={<ErrorBoundary><Suspense fallback={<DashboardSkeleton />}><WeightCut /></Suspense></ErrorBoundary>} />
                  <Route path="/hydration" element={<Navigate to="/weight-cut?tab=rehydration" replace />} />
                  <Route path="/fight-week" element={<Navigate to="/weight-cut" replace />} />
                  <Route path="/fight-camps" element={<ErrorBoundary><Suspense fallback={<DashboardSkeleton />}><FightCamps /></Suspense></ErrorBoundary>} />
                  <Route path="/fight-camps/:id" element={<ErrorBoundary><Suspense fallback={<DashboardSkeleton />}><FightCampDetail /></Suspense></ErrorBoundary>} />
                  <Route path="/training-calendar" element={<ErrorBoundary><Suspense fallback={<DashboardSkeleton />}><TrainingCalendar /></Suspense></ErrorBoundary>} />
                  <Route path="/fight-camp-calendar" element={<Navigate to="/training-calendar" replace />} />
                  <Route path="/recovery" element={<ErrorBoundary><Suspense fallback={<DashboardSkeleton />}><Recovery /></Suspense></ErrorBoundary>} />
                  <Route path="/sleep" element={<ErrorBoundary><Suspense fallback={<DashboardSkeleton />}><Sleep /></Suspense></ErrorBoundary>} />
                  {/* Skill Tree temporarily hidden from UI */}
                  <Route path="/gym" element={<ErrorBoundary><Suspense fallback={<DashboardSkeleton />}><GymTracker /></Suspense></ErrorBoundary>} />
                  <Route path="/my-gym" element={<ErrorBoundary><Suspense fallback={<DashboardSkeleton />}><MyGym /></Suspense></ErrorBoundary>} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
              </TutorialProvider>
              </NavigationDirectionProvider>
            </BrowserRouter>
          </WizardBackgroundProvider>
          </AITaskProvider>
          </SubscriptionProvider>
        </UserProvider>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
