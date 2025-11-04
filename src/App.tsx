import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Nutrition from "./pages/Nutrition";
import WeightTracker from "./pages/WeightTracker";
import Hydration from "./pages/Hydration";
import FightWeek from "./pages/FightWeek";
import Wizard from "./pages/Wizard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider>
    <div className="min-h-screen flex w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-4">
          <SidebarTrigger />
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  </SidebarProvider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
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
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
