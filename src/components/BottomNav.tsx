import { Home, Utensils, Plus, Weight, Target, MoreHorizontal, Trophy, Calendar, LogOut, HeartPulse, GitBranch, Trash2, Dumbbell, TrendingDown } from "lucide-react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, memo } from "react";
import { triggerHaptic, triggerHapticSelection } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProfile, useUser, useAuth } from "@/contexts/UserContext";
import { useTutorial } from "@/tutorial/useTutorial";
import { FIGHT_ONLY_PATHS, isFighter } from "@/lib/goalType";
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
  { title: "Weight Cut", url: "/weight-cut", icon: TrendingDown },
  { title: "Skill Tree", url: "/skill-tree", icon: GitBranch },
  { title: "Gym Tracker", url: "/gym", icon: Dumbbell },
];

export const BottomNav = memo(function BottomNav() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { userName, avatarUrl, setUserName, setAvatarUrl } = useProfile();
  const { userId, profile, refreshProfile } = useUser();
  const { signOut } = useAuth();
  const { replayTutorial } = useTutorial();
  const goalType = (profile?.goal_type as 'cutting' | 'losing') ?? 'cutting';
  const filteredMoreMenuItems = isFighter(goalType)
    ? moreMenuItems
    : moreMenuItems.filter(item => !FIGHT_ONLY_PATHS.includes(item.url));
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
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
      import("../pages/TrainingCalendar").catch(() => {});
      import("../pages/Recovery").catch(() => {});
      import("../pages/SkillTree").catch(() => {});
      import("../pages/GymTracker").catch(() => {});
      if (isFighter(goalType)) {
        import("../pages/FightCamps").catch(() => {});
        import("../pages/WeightCut").catch(() => {});
      }
    }
  }, [moreMenuOpen, goalType]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    triggerHapticSelection();
  };

  const handleLogFood = () => {
    setQuickLogOpen(false);
    setTimeout(() => navigate("/nutrition?openManualMeal=true"), 150);
  };

  const handleLogWeight = () => {
    setQuickLogOpen(false);
    setTimeout(() => navigate("/weight?focusWeightInput=true"), 150);
  };

  const handleLogTraining = () => {
    setQuickLogOpen(false);
    setTimeout(() => navigate("/training-calendar?openLogSession=true"), 150);
  };

  const handleLogGym = () => {
    setQuickLogOpen(false);
    setTimeout(() => navigate("/gym"), 150);
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

  const handleToggleGoalType = async (fighterMode: boolean) => {
    if (!userId) return;
    const newType = fighterMode ? 'cutting' : 'losing';
    try {
      await supabase.from('profiles').update({
        goal_type: newType,
        ...(newType === 'losing' ? { fight_week_target_kg: null } : {}),
      }).eq('id', userId);
      await refreshProfile();
      triggerHapticSelection();
      if (newType === 'cutting') {
        toast({ description: "Fighter mode enabled. Set your fight week target in Goals." });
        setSettingsDialogOpen(false);
        navigate("/goals");
      } else {
        toast({ description: "Switched to weight loss mode." });
      }
    } catch {
      toast({ description: "Failed to update mode.", variant: "destructive" });
    }
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
      setSettingsDialogOpen(false);
    } catch (error) {
      toast({ description: "Failed to update profile", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutDialogOpen(false);
    setMoreMenuOpen(false);
    await signOut();
    navigate("/auth");
    toast({ title: "Signed out", description: "You have been successfully signed out." });
    setLoggingOut(false);
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

  if (!isMobile) return null;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-[9999] md:hidden bg-background/95 dark:bg-[hsl(0,0%,7%)] border-t border-border safe-area-inset-bottom">
        <div className="flex items-center justify-around h-[52px] px-1">
          {/* Dashboard */}
          <NavLink
            to={mainNavItems[0].url}
            data-tutorial="nav-dashboard"
            onClick={() => triggerHaptic(ImpactStyle.Light)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-1 touch-target transition-colors duration-100 ${isActive
                ? "text-primary"
                : "text-muted-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <DashboardIcon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.5 : 1.8} />
                <span className={`text-[10px] leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[0].title}</span>
                {isActive && <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
              </>
            )}
          </NavLink>

          {/* Nutrition */}
          <NavLink
            to={mainNavItems[1].url}
            data-tutorial="nav-nutrition"
            onClick={() => triggerHaptic(ImpactStyle.Light)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-1 touch-target transition-colors duration-100 ${isActive
                ? "text-primary"
                : "text-muted-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <NutritionIcon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.5 : 1.8} />
                <span className={`text-[10px] leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[1].title}</span>
                {isActive && <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
              </>
            )}
          </NavLink>

          {/* Log button - inline tab style */}
          <button
            onClick={() => {
              triggerHaptic(ImpactStyle.Medium);
              setQuickLogOpen(true);
            }}
            data-tutorial="nav-quick-log"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1 touch-target text-muted-foreground active:scale-95 transition-transform duration-100"
            aria-label="Quick Log"
          >
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <Plus className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="text-[10px] font-medium leading-tight">Log</span>
          </button>

          {/* Weight */}
          <NavLink
            to={mainNavItems[2].url}
            data-tutorial="nav-weight"
            onClick={() => triggerHaptic(ImpactStyle.Light)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-1 touch-target transition-colors duration-100 ${isActive
                ? "text-primary"
                : "text-muted-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <WeightIcon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.5 : 1.8} />
                <span className={`text-[10px] leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[2].title}</span>
                {isActive && <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
              </>
            )}
          </NavLink>

          {/* More button */}
          <button
            onClick={() => { setMoreMenuOpen(true); triggerHapticSelection(); }}
            data-tutorial="nav-more"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1 touch-target transition-colors duration-100 text-muted-foreground"
            aria-label="More"
          >
            <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={1.8} />
            <span className="text-[10px] font-medium leading-tight">More</span>
          </button>
        </div>
      </nav>

      <QuickLogDialog
        open={quickLogOpen}
        onOpenChange={setQuickLogOpen}
        onLogFood={handleLogFood}
        onLogWeight={handleLogWeight}
        onLogTraining={handleLogTraining}
        onLogGym={handleLogGym}
      />

      <MoreMenuSheet
        open={moreMenuOpen}
        onOpenChange={setMoreMenuOpen}
        menuItems={filteredMoreMenuItems}
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
        }}
        onSave={handleUpdateProfile}
        onReplayTutorial={handleReplayTutorial}
        onDeleteAccount={() => { setSettingsDialogOpen(false); setDeleteAccountDialogOpen(true); }}
        goalType={goalType}
        onToggleGoalType={handleToggleGoalType}
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
});
