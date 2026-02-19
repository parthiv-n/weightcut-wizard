import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ProfileCompletionGuard } from "@/components/ProfileCompletionGuard";
import { UserProvider } from "@/contexts/UserContext";
import { PageTransition } from "@/components/PageTransition";
import { BottomNav } from "@/components/BottomNav";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DashboardSkeleton } from "@/components/ui/skeleton-loader";
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
const Wizard = lazy(() => import("./pages/Wizard"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const SKIP_ROUTES = ['/', '/auth', '/onboarding'];

import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from "@/integrations/supabase/client";

function RouteTracker() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!SKIP_ROUTES.includes(location.pathname)) {
      localStorage.setItem('lastRoute', location.pathname);
    }
  }, [location.pathname]);

  // Handle Deep Links (Supabase Auth)
  useEffect(() => {
    CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      console.log('App opened with URL:', url);

      // Handle Supabase PKCE Code
      if (url.includes('code=')) {
        try {
          const params = new URLSearchParams(new URL(url).search);
          const code = params.get('code');
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error) {
              navigate('/dashboard');
            }
          }
        } catch (e) {
          console.error("Error exchanging code:", e);
        }
      }

      // Handle Implicit Flow or Redirects
      if (url.includes('weightcutwizard://dashboard')) {
        navigate('/dashboard');
      }
    });
  }, [navigate]);

  return null;
}

const AppLayoutContent = ({ children }: { children: React.ReactNode }) => {
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
          {/* Floating theme toggle button - right side, mobile only */}
          <div className="fixed top-0 right-0 z-[9999] md:hidden safe-area-inset-top p-2">
            <div className="h-12 w-12 rounded-full shadow-lg bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border border-border/50 flex items-center justify-center touch-target hover:bg-background/90 transition-all overflow-hidden">
              <ThemeToggle className="touch-target h-full w-full" />
            </div>
          </div>
          {/* Desktop-only header with sidebar trigger and theme toggle */}
          <header className="hidden md:flex sticky top-0 z-50 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 items-center justify-between px-4 md:static md:z-auto">
            <SidebarTrigger className="touch-target" />
            <ThemeToggle className="touch-target" />
          </header>
          {/* Main content with mobile-first responsive padding - bottom padding for bottom nav */}
          <main className="flex-1 overflow-auto relative min-h-0 w-full pb-20 md:pb-0">
            <Suspense fallback={<DashboardSkeleton />}>
              <PageTransition>
                {children}
              </PageTransition>
            </Suspense>
          </main>
        </div>
      </div>
      {/* Bottom Navigation - Mobile Only */}
      <BottomNav />
    </>
  );
};

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider>
    <AppLayoutContent>{children}</AppLayoutContent>
  </SidebarProvider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ErrorBoundary>
        <UserProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <RouteTracker />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/onboarding" element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              } />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <ProfileCompletionGuard>
                    <AppLayout>
                      <Dashboard />
                    </AppLayout>
                  </ProfileCompletionGuard>
                </ProtectedRoute>
              } />
              <Route path="/goals" element={
                <ProtectedRoute>
                  <ProfileCompletionGuard>
                    <AppLayout>
                      <Goals />
                    </AppLayout>
                  </ProfileCompletionGuard>
                </ProtectedRoute>
              } />
              <Route path="/nutrition" element={
                <ProtectedRoute>
                  <ProfileCompletionGuard>
                    <AppLayout>
                      <Nutrition />
                    </AppLayout>
                  </ProfileCompletionGuard>
                </ProtectedRoute>
              } />
              <Route path="/weight" element={
                <ProtectedRoute>
                  <ProfileCompletionGuard>
                    <AppLayout>
                      <WeightTracker />
                    </AppLayout>
                  </ProfileCompletionGuard>
                </ProtectedRoute>
              } />
              <Route path="/hydration" element={
                <ProtectedRoute>
                  <ProfileCompletionGuard>
                    <AppLayout>
                      <Hydration />
                    </AppLayout>
                  </ProfileCompletionGuard>
                </ProtectedRoute>
              } />
              <Route path="/fight-camps" element={
                <ProtectedRoute>
                  <ProfileCompletionGuard>
                    <AppLayout>
                      <FightCamps />
                    </AppLayout>
                  </ProfileCompletionGuard>
                </ProtectedRoute>
              } />
              <Route path="/fight-camps/:id" element={
                <ProtectedRoute>
                  <ProfileCompletionGuard>
                    <AppLayout>
                      <FightCampDetail />
                    </AppLayout>
                  </ProfileCompletionGuard>
                </ProtectedRoute>
              } />
              <Route path="/fight-week" element={
                <ProtectedRoute>
                  <ProfileCompletionGuard>
                    <AppLayout>
                      <FightWeek />
                    </AppLayout>
                  </ProfileCompletionGuard>
                </ProtectedRoute>
              } />
              <Route path="/wizard" element={
                <ProtectedRoute>
                  <ProfileCompletionGuard>
                    <AppLayout>
                      <Wizard />
                    </AppLayout>
                  </ProfileCompletionGuard>
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </UserProvider>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
