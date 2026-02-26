import { Home, Utensils, Plus, Weight, Target, MoreHorizontal, Trophy, Settings, LogOut, Droplets, Calendar, Moon, Sun, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Input } from "@/components/ui/input";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";
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

const mainNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Nutrition", url: "/nutrition", icon: Utensils },
  { title: "Weight", url: "/weight", icon: Weight },
];

const moreMenuItems = [
  { title: "Goals", url: "/goals", icon: Target },
  { title: "Fight Camps", url: "/fight-camps", icon: Trophy },
  { title: "Fight Camp Calendar", url: "/fight-camp-calendar", icon: Calendar },
  { title: "Rehydration", url: "/hydration", icon: Droplets },
  { title: "Fight Week", url: "/fight-week", icon: Calendar },
];

export function BottomNav() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userName, avatarUrl, setUserName, setAvatarUrl } = useUser();
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState(userName);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    return saved || "dark";
  });

  useEffect(() => {
    setEditedName(userName);
  }, [userName]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
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

  const handleMoreItemClick = (url: string) => {
    setMoreMenuOpen(false);
    navigate(url);
  };

  const handleSettings = () => {
    setMoreMenuOpen(false);
    setEditedName(userName);
    setSettingsDialogOpen(true);
  };

  const handleUpdateProfile = async () => {
    try {
      setUserName(editedName);
      toast({
        description: "Profile updated successfully",
      });
      setSettingsDialogOpen(false);
    } catch (error) {
      toast({
        description: "Failed to update profile",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    setLogoutDialogOpen(false);
    await supabase.auth.signOut();
    navigate("/auth");
    toast({
      title: "Signed out",
      description: "You have been successfully signed out.",
    });
  };

  // Extract icon components for JSX
  const DashboardIcon = mainNavItems[0].icon;
  const NutritionIcon = mainNavItems[1].icon;
  const WeightIcon = mainNavItems[2].icon;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-[9999] md:hidden bg-background/80 backdrop-blur-2xl border-t border-border/40 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-16 px-2 relative">
          {/* Dashboard */}
          <NavLink
            to={mainNavItems[0].url}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 ${isActive
                ? "text-primary"
                : "text-muted-foreground active:scale-95"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <DashboardIcon className="h-6 w-6" />
                <span className={`text-[10px] tracking-wide leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[0].title}</span>
              </>
            )}
          </NavLink>

          {/* Nutrition */}
          <NavLink
            to={mainNavItems[1].url}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 ${isActive
                ? "text-primary"
                : "text-muted-foreground active:scale-95"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <NutritionIcon className="h-6 w-6" />
                <span className={`text-[10px] tracking-wide leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[1].title}</span>
              </>
            )}
          </NavLink>

          {/* Center plus button - floating FAB */}
          <button
            onClick={() => setQuickLogOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target"
            aria-label="Quick Log"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 transition-transform duration-150 flex items-center justify-center">
              <Plus className="h-7 w-7" strokeWidth={2.5} />
            </div>
          </button>

          {/* Weight */}
          <NavLink
            to={mainNavItems[2].url}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 ${isActive
                ? "text-primary"
                : "text-muted-foreground active:scale-95"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <WeightIcon className="h-6 w-6" />
                <span className={`text-[10px] tracking-wide leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[2].title}</span>
              </>
            )}
          </NavLink>

          {/* More button */}
          <button
            onClick={() => setMoreMenuOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 text-muted-foreground active:scale-95"
            aria-label="More"
          >
            <MoreHorizontal className="h-6 w-6" />
            <span className="text-[10px] font-medium tracking-wide leading-tight">More</span>
          </button>
        </div>
      </nav>

      {/* Quick Log Dialog */}
      <Dialog open={quickLogOpen} onOpenChange={setQuickLogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Log</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4">
            <Button
              onClick={handleLogFood}
              size="lg"
              className="h-16 flex items-center justify-start gap-4 px-6"
              variant="outline"
            >
              <Utensils className="h-6 w-6 text-emerald-500" />
              <span className="text-lg font-semibold">Log Food</span>
            </Button>
            <Button
              onClick={handleLogWeight}
              size="lg"
              className="h-16 flex items-center justify-start gap-4 px-6"
              variant="outline"
            >
              <Weight className="h-6 w-6 text-blue-500" />
              <span className="text-lg font-semibold">Log Weight</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* More Menu Sheet — iOS-style bottom sheet */}
      <Sheet open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
        <SheetContent
          side="bottom"
          className="h-[65vh] max-h-[85vh] rounded-t-3xl flex flex-col p-0 gap-0 bg-background/95 dark:bg-background/98 backdrop-blur-xl border-t border-border/50 [&>button]:hidden pb-[env(safe-area-inset-bottom)]"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/25" aria-hidden />
          </div>
          <SheetHeader className="px-5 pb-2 pt-1 text-left shrink-0">
            <SheetTitle className="text-lg font-semibold text-foreground">More</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 scrollbar-hide scroll-touch pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {/* Nav links group */}
            <motion.div
              className="rounded-2xl bg-muted/30 dark:bg-white/5 overflow-hidden border border-border/50 dark:border-white/10"
              initial="closed"
              animate="open"
              variants={{
                open: { transition: { staggerChildren: 0.032, delayChildren: 0.06 } },
                closed: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
              }}
            >
              {moreMenuItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.button
                    key={item.url}
                    type="button"
                    onClick={() => handleMoreItemClick(item.url)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation text-left border-b border-border/40 dark:border-white/5 last:border-b-0"
                    variants={{
                      open: { opacity: 1, y: 0 },
                      closed: { opacity: 0, y: 6 },
                    }}
                    transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                      <Icon className="h-5 w-5 text-primary" />
                    </span>
                    <span className="flex-1 text-[15px] font-medium text-foreground">{item.title}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </motion.button>
                );
              })}
            </motion.div>

            {/* Settings & Logout group */}
            <motion.div
              className="mt-3 rounded-2xl bg-muted/30 dark:bg-white/5 overflow-hidden border border-border/50 dark:border-white/10"
              initial="closed"
              animate="open"
              variants={{
                open: { transition: { staggerChildren: 0.04, delayChildren: 0.2 } },
                closed: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
              }}
            >
              <motion.button
                type="button"
                onClick={handleSettings}
                className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation text-left border-b border-border/40 dark:border-white/5"
                variants={{
                  open: { opacity: 1, y: 0 },
                  closed: { opacity: 0, y: 6 },
                }}
                transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted dark:bg-white/10">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                </span>
                <span className="flex-1 text-[15px] font-medium text-foreground">Settings</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setLogoutDialogOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-destructive/10 transition-colors touch-manipulation text-left"
                variants={{
                  open: { opacity: 1, y: 0 },
                  closed: { opacity: 0, y: 6 },
                }}
                transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                  <LogOut className="h-5 w-5 text-destructive" />
                </span>
                <span className="flex-1 text-[15px] font-medium text-destructive">Log out</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </motion.button>
            </motion.div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Settings Panel */}
      {settingsDialogOpen && (
        <>
          <div
            className="fixed inset-0 z-[10001] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setSettingsDialogOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[10002] bg-background/95 dark:bg-background/98 backdrop-blur-xl border-t border-border/50 rounded-t-3xl animate-in slide-in-from-bottom duration-300 safe-area-inset-bottom">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
            </div>
            <div className="px-5 pb-2 pt-1">
              <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            </div>

            <div className="px-4 space-y-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}>
              {/* Profile Picture + Name row */}
              <div className="rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 p-4">
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Profile" className="h-14 w-14 rounded-full object-cover border-2 border-primary/20" />
                    ) : (
                      <div className="h-14 w-14 rounded-full bg-muted/50 border-2 border-border/50 flex items-center justify-center">
                        <span className="text-xl font-bold text-muted-foreground">{(userName || "?")[0]?.toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <Input
                      id="name"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder="Your name"
                      className="h-10 rounded-xl bg-background/60 dark:bg-white/5 border-border/40 text-sm font-medium"
                    />
                    <ProfilePictureUpload
                      currentAvatarUrl={avatarUrl || undefined}
                      onUploadSuccess={(url) => {
                        setAvatarUrl(url);
                        toast({ description: "Profile picture updated" });
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Appearance */}
              <button
                type="button"
                onClick={toggleTheme}
                className="w-full rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 overflow-hidden active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation text-left"
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                      {theme === "light" ? (
                        <Sun className="h-5 w-5 text-primary" />
                      ) : (
                        <Moon className="h-5 w-5 text-primary" />
                      )}
                    </span>
                    <div>
                      <p className="text-[15px] font-medium text-foreground">Appearance</p>
                      <p className="text-xs text-muted-foreground">{theme === "dark" ? "Dark mode" : "Light mode"}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </div>
              </button>

              {/* Save */}
              <Button
                onClick={handleUpdateProfile}
                className="w-full h-11 rounded-2xl text-base font-bold bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/20"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </>
      )}

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
    </>
  );
}

