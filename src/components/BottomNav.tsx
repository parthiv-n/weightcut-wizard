import { Home, Utensils, Plus, Weight, Target, MoreHorizontal, Trophy, Droplets, Calendar, LogOut, HeartPulse, GitBranch, Trash2, Dumbbell } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { triggerHaptic, triggerHapticSelection } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { springs } from "@/lib/motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/contexts/UserContext";
import { useTutorial } from "@/tutorial/useTutorial";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { QuickLogDialog } from "@/components/nav/QuickLogDialog";
import { MoreMenuSheet } from "@/components/nav/MoreMenuSheet";
import { SettingsPanel } from "@/components/nav/SettingsPanel";

const mainNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Nutrition", url: "/nutrition", icon: Utensils },
  { title: "Weight", url: "/weight", icon: Weight },
];

const moreMenuItems = [
  { title: "Goals", url: "/goals", icon: Target },
  { title: "Fight Camps", url: "/fight-camps", icon: Trophy },
  { title: "Training Calendar", url: "/training-calendar", icon: Calendar },
  { title: "Recovery", url: "/recovery", icon: HeartPulse },
  { title: "Rehydration", url: "/hydration", icon: Droplets },
  { title: "Fight Week", url: "/fight-week", icon: Calendar },
  { title: "Skill Tree", url: "/skill-tree", icon: GitBranch },
  { title: "Gym Tracker", url: "/gym", icon: Dumbbell },
];

export function BottomNav() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const { toast } = useToast();
  const { userName, avatarUrl, setUserName, setAvatarUrl } = useProfile();
  const { replayTutorial } = useTutorial();
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editedName, setEditedName] = useState(userName);
  const [userEmail, setUserEmail] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    return saved || "dark";
  });

  useEffect(() => {
    setEditedName(userName);
  }, [userName]);

  // Preload More menu page chunks when the menu opens
  useEffect(() => {
    if (moreMenuOpen) {
      import("../pages/Goals").catch(() => {});
      import("../pages/FightCamps").catch(() => {});
      import("../pages/TrainingCalendar").catch(() => {});
      import("../pages/Recovery").catch(() => {});
      import("../pages/Hydration").catch(() => {});
      import("../pages/FightWeek").catch(() => {});
      import("../pages/SkillTree").catch(() => {});
      import("../pages/GymTracker").catch(() => {});
    }
  }, [moreMenuOpen]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    triggerHapticSelection();
  };

  if (!isMobile) {
    return null;
  }

  const handleLogFood = () => {
    setQuickLogOpen(false);
    navigate("/nutrition?openManualMeal=true");
  };

  const handleLogWeight = () => {
    setQuickLogOpen(false);
    navigate("/weight?focusWeightInput=true");
  };

  const handleLogTraining = () => {
    setQuickLogOpen(false);
    navigate("/training-calendar?openLogSession=true");
  };

  const handleMoreItemClick = (url: string) => {
    setMoreMenuOpen(false);
    navigate(url);
  };

  const handleSettings = async () => {
    setMoreMenuOpen(false);
    setEditedName(userName);
    setSettingsDialogOpen(true);
    const { data } = await supabase.auth.getUser();
    if (data.user?.email) setUserEmail(data.user.email);
  };

  const handleReplayTutorial = () => {
    setSettingsDialogOpen(false);
    setMoreMenuOpen(false);
    navigate("/dashboard");
    setTimeout(() => replayTutorial("onboarding"), 600);
  };

  const handleUpdateProfile = async () => {
    try {
      setUserName(editedName);
      toast({ description: "Profile updated successfully" });
      setSettingsDialogOpen(false);
    } catch (error) {
      toast({ description: "Failed to update profile", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    setLogoutDialogOpen(false);
    await supabase.auth.signOut();
    navigate("/auth");
    toast({ title: "Signed out", description: "You have been successfully signed out." });
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      await supabase.auth.signOut();
      setDeleteAccountDialogOpen(false);
      setSettingsDialogOpen(false);
      navigate("/auth");
      toast({ title: "Account deleted", description: "Your account and all data have been permanently deleted." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete account. Please try again.", variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  const DashboardIcon = mainNavItems[0].icon;
  const NutritionIcon = mainNavItems[1].icon;
  const WeightIcon = mainNavItems[2].icon;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-[9999] md:hidden bg-background border-t border-border/40 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-16 px-2 relative">
          {/* Dashboard */}
          <NavLink
            to={mainNavItems[0].url}
            data-tutorial="nav-dashboard"
            onClick={() => triggerHaptic(ImpactStyle.Light)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 ${isActive
                ? "text-primary"
                : "text-muted-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <span className="relative flex flex-col items-center gap-1">
                {isActive && (
                  <motion.span
                    layoutId="nav-active-bg"
                    className="absolute inset-0 -mx-3 -my-1 rounded-2xl bg-primary/15"
                    transition={springs.snappy}
                  />
                )}
                <DashboardIcon className="relative z-10 h-6 w-6" />
                <span className={`relative z-10 text-[10px] tracking-wide leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[0].title}</span>
              </span>
            )}
          </NavLink>

          {/* Nutrition */}
          <NavLink
            to={mainNavItems[1].url}
            data-tutorial="nav-nutrition"
            onClick={() => triggerHaptic(ImpactStyle.Light)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 ${isActive
                ? "text-primary"
                : "text-muted-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <span className="relative flex flex-col items-center gap-1">
                {isActive && (
                  <motion.span
                    layoutId="nav-active-bg"
                    className="absolute inset-0 -mx-3 -my-1 rounded-2xl bg-primary/15"
                    transition={springs.snappy}
                  />
                )}
                <NutritionIcon className="relative z-10 h-6 w-6" />
                <span className={`relative z-10 text-[10px] tracking-wide leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[1].title}</span>
              </span>
            )}
          </NavLink>

          {/* Center plus button - floating FAB */}
          <motion.button
            onClick={() => { setQuickLogOpen(true); triggerHaptic(ImpactStyle.Medium); }}
            data-tutorial="nav-quick-log"
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target"
            aria-label="Quick Log"
            whileTap={{ scale: 0.9 }}
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center">
              <Plus className="h-7 w-7" strokeWidth={2.5} />
            </div>
          </motion.button>

          {/* Weight */}
          <NavLink
            to={mainNavItems[2].url}
            data-tutorial="nav-weight"
            onClick={() => triggerHaptic(ImpactStyle.Light)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 ${isActive
                ? "text-primary"
                : "text-muted-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <span className="relative flex flex-col items-center gap-1">
                {isActive && (
                  <motion.span
                    layoutId="nav-active-bg"
                    className="absolute inset-0 -mx-3 -my-1 rounded-2xl bg-primary/15"
                    transition={springs.snappy}
                  />
                )}
                <WeightIcon className="relative z-10 h-6 w-6" />
                <span className={`relative z-10 text-[10px] tracking-wide leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[2].title}</span>
              </span>
            )}
          </NavLink>

          {/* More button */}
          <button
            onClick={() => { setMoreMenuOpen(true); triggerHapticSelection(); }}
            data-tutorial="nav-more"
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 text-muted-foreground"
            aria-label="More"
          >
            <MoreHorizontal className="h-6 w-6" />
            <span className="text-[10px] font-medium tracking-wide leading-tight">More</span>
          </button>
        </div>
      </nav>

      <QuickLogDialog
        open={quickLogOpen}
        onOpenChange={setQuickLogOpen}
        onLogFood={handleLogFood}
        onLogWeight={handleLogWeight}
        onLogTraining={handleLogTraining}
      />

      <MoreMenuSheet
        open={moreMenuOpen}
        onOpenChange={setMoreMenuOpen}
        menuItems={moreMenuItems}
        onItemClick={handleMoreItemClick}
        onSettings={handleSettings}
        onLogout={() => setLogoutDialogOpen(true)}
      />

      <SettingsPanel
        open={settingsDialogOpen}
        onClose={() => setSettingsDialogOpen(false)}
        userName={userName}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        editedName={editedName}
        setEditedName={setEditedName}
        theme={theme}
        onToggleTheme={toggleTheme}
        onAvatarChange={(url) => {
          setAvatarUrl(url);
          toast({ description: "Profile picture updated" });
        }}
        onSave={handleUpdateProfile}
        onReplayTutorial={handleReplayTutorial}
        onDeleteAccount={() => { setSettingsDialogOpen(false); setDeleteAccountDialogOpen(true); }}
      />

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader className="sm:text-center">
            <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 dark:bg-destructive/15 ring-1 ring-destructive/20">
              <LogOut className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center">Sign Out</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Are you sure you want to sign out? You'll need to sign in again to access your data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:justify-center pt-1">
            <AlertDialogCancel className="flex-1 sm:flex-initial sm:min-w-[100px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="flex-1 sm:flex-initial sm:min-w-[100px] rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={deleteAccountDialogOpen} onOpenChange={(open) => { if (!deleteLoading) setDeleteAccountDialogOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-center items-center">
            <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/20">
              <Trash2 className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center text-lg">Delete Account</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[13px] leading-relaxed">
              This will permanently delete your account and all associated data.
              <span className="block mt-2 text-xs text-muted-foreground/50">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 pt-2">
            <AlertDialogCancel className="flex-1 h-12 rounded-2xl text-[15px] font-semibold" disabled={deleteLoading}>
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={handleDeleteAccount}
              disabled={deleteLoading}
              className="flex-1 h-12 rounded-2xl text-[15px] font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
