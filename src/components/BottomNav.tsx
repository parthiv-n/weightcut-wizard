import { Home, Utensils, Plus, Weight, Target, MoreHorizontal, Trophy, Calendar, HeartPulse, Dumbbell, TrendingDown, Moon, Users } from "lucide-react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, memo } from "react";
import { motion, LayoutGroup } from "motion/react";
import { triggerHaptic, triggerHapticSelection } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProfile, useUser, useAuth } from "@/contexts/UserContext";
import { useMyGyms } from "@/hooks/coach/useMyGyms";
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
  // Only fetch gym memberships for athletes — coaches use the /coach surface
  const isAthlete = profile?.role !== "coach";
  const { gyms: myGyms } = useMyGyms(isAthlete ? userId : null);
  const primaryGym = myGyms[0] ?? null;
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
      <motion.nav
        data-bottom-nav
        initial={{ y: 24, x: "-50%", opacity: 0 }}
        animate={{ y: 0, x: "-50%", opacity: 1 }}
        transition={{ type: "spring", damping: 22, stiffness: 260, mass: 0.6 }}
        className="fixed left-1/2 z-[9999] md:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
      >
        <LayoutGroup id="bottom-nav">
          <div className="flex items-center gap-1 p-1.5 rounded-full bg-card/70 backdrop-blur-2xl border border-white/10 shadow-[0_12px_30px_-8px_rgba(0,0,0,0.55),0_2px_0_rgba(255,255,255,0.04)_inset,0_-1px_0_rgba(0,0,0,0.35)_inset]">
            <NavItem
              to={mainNavItems[0].url}
              icon={DashboardIcon}
              label={mainNavItems[0].title}
              isActive={location.pathname === mainNavItems[0].url}
              tutorial="nav-dashboard"
            />
            <NavItem
              to={mainNavItems[1].url}
              icon={NutritionIcon}
              label={mainNavItems[1].title}
              isActive={location.pathname === mainNavItems[1].url}
              tutorial="nav-nutrition"
            />

            {/* Log button — raised primary circle */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              transition={{ type: "spring", damping: 18, stiffness: 420 }}
              onClick={() => { triggerHaptic(ImpactStyle.Medium); setQuickLogOpen(true); }}
              data-tutorial="nav-quick-log"
              className="relative mx-0.5 h-11 w-11 rounded-full bg-primary flex items-center justify-center shadow-[0_6px_16px_-4px_hsl(var(--primary)/0.55),0_1px_0_rgba(255,255,255,0.2)_inset]"
              aria-label="Quick Log"
            >
              <Plus className="h-5 w-5 text-primary-foreground" strokeWidth={2.75} />
            </motion.button>

            <NavItem
              to={mainNavItems[2].url}
              icon={WeightIcon}
              label={mainNavItems[2].title}
              isActive={location.pathname === mainNavItems[2].url}
              tutorial="nav-weight"
            />

            {/* More */}
            <NavButton
              onClick={() => { setMoreMenuOpen(true); triggerHapticSelection(); }}
              icon={MoreHorizontal}
              label="More"
              isActive={filteredMoreMenuItems.some(i => i.url === location.pathname)}
              tutorial="nav-more"
            />
          </div>
        </LayoutGroup>
      </motion.nav>

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
        onMyGym={() => { setMoreMenuOpen(false); navigate("/my-gym"); }}
        gymLogoUrl={primaryGym?.gym_logo_url ?? null}
        gymName={primaryGym?.gym_name ?? null}
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
        <AlertDialogContent className="max-w-[240px] rounded-2xl p-0 border-0 bg-card/90 backdrop-blur-xl overflow-hidden gap-0 shadow-2xl">
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
        <AlertDialogContent className="max-w-[240px] rounded-2xl p-0 border-0 bg-card/90 backdrop-blur-xl overflow-hidden gap-0 shadow-2xl">
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

interface NavItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  isActive: boolean;
  tutorial?: string;
}

function NavItem({ to, icon: Icon, label, isActive, tutorial }: NavItemProps) {
  return (
    <NavLink
      to={to}
      data-tutorial={tutorial}
      onClick={() => triggerHaptic(ImpactStyle.Light)}
      aria-label={label}
      className="relative flex h-11 w-11 items-center justify-center rounded-full"
    >
      {isActive && (
        <motion.div
          layoutId="nav-active-pill"
          className="absolute inset-0 rounded-full bg-primary/15"
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
        />
      )}
      <Icon
        className={`relative h-[22px] w-[22px] transition-colors duration-150 ${isActive ? "text-primary" : "text-muted-foreground/75"}`}
        strokeWidth={isActive ? 2.4 : 1.9}
      />
    </NavLink>
  );
}

interface NavButtonProps {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  isActive: boolean;
  tutorial?: string;
}

function NavButton({ onClick, icon: Icon, label, isActive, tutorial }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      data-tutorial={tutorial}
      aria-label={label}
      className="relative flex h-11 w-11 items-center justify-center rounded-full"
    >
      {isActive && (
        <motion.div
          layoutId="nav-active-pill"
          className="absolute inset-0 rounded-full bg-primary/15"
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
        />
      )}
      <Icon
        className={`relative h-[22px] w-[22px] transition-colors duration-150 ${isActive ? "text-primary" : "text-muted-foreground/75"}`}
        strokeWidth={isActive ? 2.4 : 1.9}
      />
    </button>
  );
}
