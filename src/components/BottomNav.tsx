import { Home, Utensils, Plus, Weight, Target, MoreHorizontal, Trophy, Calendar, HeartPulse, Dumbbell, TrendingDown, Moon } from "lucide-react";
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
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
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
  { title: "Sleep", url: "/sleep", icon: Moon },
  { title: "Weight Cut", url: "/weight-cut", icon: TrendingDown },
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
    navigate("/nutrition?openAddMeal=true");
  };

  const handleLogWeight = () => {
    setQuickLogOpen(false);
    navigate("/weight?focusWeightInput=true");
  };

  const handleLogTraining = () => {
    setQuickLogOpen(false);
    navigate("/training-calendar?openLogSession=true");
  };

  const handleLogGym = () => {
    setQuickLogOpen(false);
    navigate("/gym");
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
      <nav className="fixed bottom-0 left-0 right-0 z-[9999] md:hidden bg-background/98 backdrop-blur-lg border-t border-border/30" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex items-center justify-around h-[44px] px-2">
          {/* Dashboard */}
          <NavLink
            to={mainNavItems[0].url}
            data-tutorial="nav-dashboard"
            onClick={() => triggerHaptic(ImpactStyle.Light)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-0.5 transition-colors duration-100 ${isActive ? "text-primary" : "text-muted-foreground/70"}`
            }
          >
            {({ isActive }) => (
              <>
                <DashboardIcon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.8} />
                <span className={`text-[10px] leading-none mt-0.5 ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[0].title}</span>
              </>
            )}
          </NavLink>

          {/* Nutrition */}
          <NavLink
            to={mainNavItems[1].url}
            data-tutorial="nav-nutrition"
            onClick={() => triggerHaptic(ImpactStyle.Light)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-0.5 transition-colors duration-100 ${isActive ? "text-primary" : "text-muted-foreground/70"}`
            }
          >
            {({ isActive }) => (
              <>
                <NutritionIcon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.8} />
                <span className={`text-[10px] leading-none mt-0.5 ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[1].title}</span>
              </>
            )}
          </NavLink>

          {/* Log button */}
          <button
            onClick={() => { triggerHaptic(ImpactStyle.Medium); setQuickLogOpen(true); }}
            data-tutorial="nav-quick-log"
            className="flex flex-col items-center justify-center px-3 py-0.5 active:scale-90 transition-transform duration-100"
            aria-label="Quick Log"
          >
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
              <Plus className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
          </button>

          {/* Weight */}
          <NavLink
            to={mainNavItems[2].url}
            data-tutorial="nav-weight"
            onClick={() => triggerHaptic(ImpactStyle.Light)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-0.5 transition-colors duration-100 ${isActive ? "text-primary" : "text-muted-foreground/70"}`
            }
          >
            {({ isActive }) => (
              <>
                <WeightIcon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.8} />
                <span className={`text-[10px] leading-none mt-0.5 ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[2].title}</span>
              </>
            )}
          </NavLink>

          {/* More */}
          <button
            onClick={() => { setMoreMenuOpen(true); triggerHapticSelection(); }}
            data-tutorial="nav-more"
            className="flex-1 flex flex-col items-center justify-center py-0.5 transition-colors duration-100 text-muted-foreground/70"
            aria-label="More"
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
            <span className="text-[13px] font-medium leading-none mt-0.5">More</span>
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
        <AlertDialogContent className="max-w-[240px] rounded-xl p-0 border-0 bg-card/90 backdrop-blur-xl overflow-hidden gap-0 shadow-2xl">
          <VisuallyHidden><AlertDialogTitle>Sign Out</AlertDialogTitle></VisuallyHidden>
          <AlertDialogDescription asChild>
            <div className="pt-4 pb-3 px-4 text-center">
              <p className="text-[15px] font-semibold text-foreground">Sign Out</p>
              <p className="text-[13px] text-muted-foreground mt-0.5 leading-snug">
                Are you sure? You'll need to sign in again.
              </p>
            </div>
          </AlertDialogDescription>
          <div className="border-t border-border/40">
            <button onClick={handleLogout} className="w-full py-2.5 text-[14px] font-semibold text-destructive active:bg-muted/50 transition-colors">
              Sign Out
            </button>
            <div className="border-t border-border/40" />
            <button onClick={() => setLogoutDialogOpen(false)} className="w-full py-2.5 text-[14px] font-normal text-primary active:bg-muted/50 transition-colors">
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={deleteAccountDialogOpen} onOpenChange={(open) => { if (!deleteLoading) setDeleteAccountDialogOpen(open); }}>
        <AlertDialogContent className="max-w-[240px] rounded-xl p-0 border-0 bg-card/90 backdrop-blur-xl overflow-hidden gap-0 shadow-2xl">
          <VisuallyHidden><AlertDialogTitle>Delete Account</AlertDialogTitle></VisuallyHidden>
          <AlertDialogDescription asChild>
            <div className="pt-4 pb-3 px-4 text-center">
              <p className="text-[15px] font-semibold text-foreground">Delete Account</p>
              <p className="text-[13px] text-muted-foreground mt-0.5 leading-snug">
                This will permanently delete your account and all data. This cannot be undone.
              </p>
            </div>
          </AlertDialogDescription>
          <div className="border-t border-border/40">
            <button
              onClick={handleDeleteAccount}
              disabled={deleteLoading}
              className="w-full py-2.5 text-[14px] font-semibold text-destructive active:bg-muted/50 transition-colors disabled:opacity-40"
            >
              {deleteLoading ? "Deleting..." : "Delete Account"}
            </button>
            <div className="border-t border-border/40" />
            <button
              onClick={() => setDeleteAccountDialogOpen(false)}
              disabled={deleteLoading}
              className="w-full py-2.5 text-[14px] font-normal text-primary active:bg-muted/50 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
