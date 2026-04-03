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
import { WizardBackgroundProvider } from "@/contexts/WizardBackgroundContext";
import { PageTransition } from "@/components/PageTransition";
import { NavigationDirectionProvider } from "@/hooks/useNavigationDirection";
import { TutorialProvider } from "@/tutorial/TutorialContext";
import { BottomNav } from "@/components/BottomNav";
import { FloatingWizardChat } from "@/components/FloatingWizardChat";
import * as Sentry from "@sentry/react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { RefreshCw } from "lucide-react";
import { OfflineBanner } from "@/components/OfflineBanner";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Goals = lazy(() => import("./pages/Goals"));
const Nutrition = lazy(() => import("./pages/Nutrition"));
const WeightTracker = lazy(() => import("./pages/WeightTracker"));
const Hydration = lazy(() => import("./pages/Hydration"));
const FightWeek = lazy(() => import("./pages/FightWeek"));
const FightCamps = lazy(() => import("./pages/FightCamps"));
const FightCampDetail = lazy(() => import("./pages/FightCampDetail"));
const TrainingCalendar = lazy(() => import("./pages/TrainingCalendar"));
const Recovery = lazy(() => import("./pages/Recovery"));
const SkillTree = lazy(() => import("./pages/SkillTree"));
const GymTracker = lazy(() => import("./pages/GymTracker"));
const NotFound = lazy(() => import("./pages/NotFound"));

const _idle = window.requestIdleCallback || ((cb: IdleRequestCallback) => setTimeout(cb, 50));
_idle(() => { import("./pages/Dashboard").catch(() => {}); });

const queryClient = new QueryClient();

const SKIP_ROUTES = ['/', '/auth', '/onboarding'];

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

  // Set light status bar text for dark background
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark });
      document.documentElement.classList.add("native-app");
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
          <main className="flex-1 overflow-auto overflow-x-hidden relative min-h-0 w-full pt-2 pb-24 md:pb-0 safe-area-inset-top safe-area-inset-left safe-area-inset-right">
            {/* Manual refresh button — top-left, below iOS safe area */}
            <button
              onClick={() => window.location.reload()}
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
              className="fixed right-3 z-50 h-9 w-9 flex items-center justify-center rounded-xl bg-background/95 border border-border/50 shadow-sm active:scale-90 transition-transform md:hidden"
              aria-label="Refresh page"
            >
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </button>
            <PageTransition>
              <Suspense fallback={<div className="min-h-[50vh]" />}>
                <Outlet />
              </Suspense>
            </PageTransition>
          </main>
        </div>
      </div>
      {/* Bottom Navigation - Mobile Only */}
      <BottomNav />
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
          <WizardBackgroundProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <NavigationDirectionProvider>
              <TutorialProvider>
              <RouteTracker />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/onboarding" element={
                  <ProtectedRoute>
                    <Onboarding />
                  </ProtectedRoute>
                } />

                {/* Shared layout route — AppLayout persists across all child navigations */}
                <Route element={<ProtectedAppLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/goals" element={<Goals />} />
                  <Route path="/nutrition" element={<Nutrition />} />
                  <Route path="/weight" element={<WeightTracker />} />
                  <Route path="/hydration" element={<Hydration />} />
                  <Route path="/fight-camps" element={<FightCamps />} />
                  <Route path="/fight-camps/:id" element={<FightCampDetail />} />
                  <Route path="/training-calendar" element={<TrainingCalendar />} />
                  <Route path="/fight-camp-calendar" element={<Navigate to="/training-calendar" replace />} />
                  <Route path="/recovery" element={<Recovery />} />
                  <Route path="/fight-week" element={<FightWeek />} />
                  <Route path="/skill-tree" element={<SkillTree />} />
                  <Route path="/gym" element={<GymTracker />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
              </TutorialProvider>
              </NavigationDirectionProvider>
            </BrowserRouter>
          </WizardBackgroundProvider>
        </UserProvider>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
