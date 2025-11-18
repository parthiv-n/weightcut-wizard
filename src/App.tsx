import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserProvider } from "@/contexts/UserContext";
import { PageTransition } from "@/components/PageTransition";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Goals from "./pages/Goals";
import Nutrition from "./pages/Nutrition";
import WeightTracker from "./pages/WeightTracker";
import Hydration from "./pages/Hydration";
import FightWeek from "./pages/FightWeek";
import FightCamps from "./pages/FightCamps";
import FightCampDetail from "./pages/FightCampDetail";
import Wizard from "./pages/Wizard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider>
    {/* Mobile-first layout: sidebar is hidden on mobile, shown via trigger */}
    <div className="min-h-screen-safe flex w-full no-horizontal-scroll">
      <AppSidebar />
      {/* Main content area - responsive padding for mobile */}
      <div className="flex-1 flex flex-col min-w-0 w-full">
        {/* Mobile-optimized header with safe area support */}
        <header className="h-14 sm:h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-3 sm:px-4 safe-area-inset-top touch-target">
          <SidebarTrigger className="touch-target" />
          <ThemeToggle className="touch-target" />
        </header>
        {/* Main content with mobile-first responsive padding */}
        <main className="flex-1 overflow-auto relative min-h-0 w-full">
          <PageTransition>
            {children}
          </PageTransition>
        </main>
      </div>
    </div>
  </SidebarProvider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <UserProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/goals" element={
            <ProtectedRoute>
              <AppLayout>
                <Goals />
              </AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/nutrition" element={
            <ProtectedRoute>
              <AppLayout>
                <Nutrition />
              </AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/weight" element={
            <ProtectedRoute>
              <AppLayout>
                <WeightTracker />
              </AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/hydration" element={
            <ProtectedRoute>
              <AppLayout>
                <Hydration />
              </AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/fight-camps" element={
            <ProtectedRoute>
              <AppLayout>
                <FightCamps />
              </AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/fight-camps/:id" element={
            <ProtectedRoute>
              <AppLayout>
                <FightCampDetail />
              </AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/fight-week" element={
            <ProtectedRoute>
              <AppLayout>
                <FightWeek />
              </AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/wizard" element={
            <ProtectedRoute>
              <AppLayout>
                <Wizard />
              </AppLayout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </UserProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
