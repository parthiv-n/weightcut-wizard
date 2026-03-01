import { Home, Utensils, Plus, Weight, Target, MoreHorizontal, Trophy, Settings, LogOut, Droplets, Calendar, Moon, Sun, ChevronRight, BookOpen, Dumbbell, Bell } from "lucide-react";
import { motion, LayoutGroup } from "motion/react";
import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Input } from "@/components/ui/input";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";
import { Switch } from "@/components/ui/switch";
import { Capacitor } from "@capacitor/core";
import { getSettings, saveSettings, scheduleReminder, cancelReminder, type ReminderSettings } from "@/lib/weightReminder";
import { triggerHapticSelection } from "@/lib/haptics";
import { prefetchRoute } from "@/lib/routePrefetch";
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

// Module-level motion variant constants — avoids re-creating objects on every render
const menuGroupVariants = {
  open: { transition: { staggerChildren: 0.032, delayChildren: 0.06 } },
  closed: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
} as const;

const settingsGroupVariants = {
  open: { transition: { staggerChildren: 0.04, delayChildren: 0.2 } },
  closed: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
} as const;

const menuItemVariants = {
  open: { opacity: 1, y: 0 },
  closed: { opacity: 0, y: 6 },
} as const;

const menuItemTransition = { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } as const;

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

// Route import map for touch-start prefetching
const routeImportMap: Record<string, () => Promise<any>> = {
  "/goals": () => import("@/pages/Goals"),
  "/fight-camps": () => import("@/pages/FightCamps"),
  "/fight-camp-calendar": () => import("@/pages/FightCampCalendar"),
  "/hydration": () => import("@/pages/Hydration"),
  "/fight-week": () => import("@/pages/FightWeek"),
};

export function BottomNav() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userName, avatarUrl, setUserName, setAvatarUrl } = useUser();
  const { replayTutorial } = useTutorial();
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState(userName);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    return saved || "dark";
  });
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(getSettings);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  useEffect(() => {
    setEditedName(userName);
  }, [userName]);

  // Prefetch top-3 route chunks after 2s
  useEffect(() => {
    const timer = setTimeout(() => {
      prefetchRoute(() => import("@/pages/Dashboard"), "Dashboard");
      prefetchRoute(() => import("@/pages/Nutrition"), "Nutrition");
      prefetchRoute(() => import("@/pages/WeightTracker"), "WeightTracker");
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

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

  const handleLogTraining = () => {
    setQuickLogOpen(false);
    navigate("/fight-camp-calendar?openLogSession=true");
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

  const handleReplayTutorial = () => {
    setSettingsDialogOpen(false);
    setMoreMenuOpen(false);
    navigate("/dashboard");
    // Small delay to let navigation complete before starting tutorial
    setTimeout(() => replayTutorial("onboarding"), 600);
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
        <LayoutGroup>
        <div className="flex items-center justify-around h-16 px-2 relative">
          {/* Dashboard */}
          <NavLink
            to={mainNavItems[0].url}
            data-tutorial="nav-dashboard"
            onClick={() => triggerHapticSelection()}
            className={({ isActive }) =>
              `relative flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 ${isActive
                ? "text-primary"
                : "text-muted-foreground active:scale-95"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <DashboardIcon className="h-6 w-6" />
                <span className={`text-[10px] tracking-wide leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[0].title}</span>
                {isActive && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute -bottom-0.5 inset-x-0 mx-auto w-5 h-[3px] rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </>
            )}
          </NavLink>

          {/* Nutrition */}
          <NavLink
            to={mainNavItems[1].url}
            data-tutorial="nav-nutrition"
            onClick={() => triggerHapticSelection()}
            className={({ isActive }) =>
              `relative flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 ${isActive
                ? "text-primary"
                : "text-muted-foreground active:scale-95"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <NutritionIcon className="h-6 w-6" />
                <span className={`text-[10px] tracking-wide leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[1].title}</span>
                {isActive && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute -bottom-0.5 inset-x-0 mx-auto w-5 h-[3px] rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </>
            )}
          </NavLink>

          {/* Center plus button - floating FAB */}
          <button
            onClick={() => setQuickLogOpen(true)}
            data-tutorial="nav-quick-log"
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
            data-tutorial="nav-weight"
            onClick={() => triggerHapticSelection()}
            className={({ isActive }) =>
              `relative flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 ${isActive
                ? "text-primary"
                : "text-muted-foreground active:scale-95"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <WeightIcon className="h-6 w-6" />
                <span className={`text-[10px] tracking-wide leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>{mainNavItems[2].title}</span>
                {isActive && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute -bottom-0.5 inset-x-0 mx-auto w-5 h-[3px] rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </>
            )}
          </NavLink>

          {/* More button */}
          <button
            onClick={() => setMoreMenuOpen(true)}
            data-tutorial="nav-more"
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 touch-target transition-colors duration-150 text-muted-foreground active:scale-95"
            aria-label="More"
          >
            <MoreHorizontal className="h-6 w-6" />
            <span className="text-[10px] font-medium tracking-wide leading-tight">More</span>
          </button>
        </div>
        </LayoutGroup>
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
            <Button
              onClick={handleLogTraining}
              size="lg"
              className="h-16 flex items-center justify-start gap-4 px-6"
              variant="outline"
            >
              <Dumbbell className="h-6 w-6 text-orange-500" />
              <span className="text-lg font-semibold">Log Training</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* More Menu Sheet — iOS-style bottom sheet */}
      <Sheet open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
        <SheetContent
          side="bottom"
          className="h-[70vh] max-h-[85vh] rounded-t-3xl flex flex-col p-0 gap-0 bg-background/95 dark:bg-background/98 backdrop-blur-xl border-t border-border/50 [&>button]:hidden"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/25" aria-hidden />
          </div>
          <SheetHeader className="px-5 pb-2 pt-1 text-left shrink-0">
            <SheetTitle className="text-lg font-semibold text-foreground">More</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 scrollbar-hide scroll-touch overscroll-contain" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2rem)" }}>
            {/* Nav links group */}
            <motion.div
              className="rounded-2xl bg-muted/30 dark:bg-white/5 overflow-hidden border border-border/50 dark:border-white/10"
              initial="closed"
              animate="open"
              variants={menuGroupVariants}
            >
              {moreMenuItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.button
                    key={item.url}
                    type="button"
                    onClick={() => handleMoreItemClick(item.url)}
                    onTouchStart={() => {
                      const importFn = routeImportMap[item.url];
                      if (importFn) prefetchRoute(importFn, item.url);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation text-left border-b border-border/40 dark:border-white/5 last:border-b-0"
                    variants={menuItemVariants}
                    transition={menuItemTransition}
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
              variants={settingsGroupVariants}
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

              {/* Weight Reminder (native only) */}
              {Capacitor.isNativePlatform() && (() => {
                const h = reminderSettings.hour;
                const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
                const ampm = h < 12 ? "AM" : "PM";
                const displayMinute = String(reminderSettings.minute).padStart(2, "0");
                const timeLabel = `Daily at ${displayHour}:${displayMinute} ${ampm}`;

                const handleToggle = async (checked: boolean) => {
                  const next = { ...reminderSettings, enabled: checked };
                  setReminderSettings(next);
                  saveSettings(next);
                  if (checked) {
                    await scheduleReminder(next.hour, next.minute);
                  } else {
                    await cancelReminder();
                    setTimePickerOpen(false);
                  }
                };

                const handleTimeChange = async (field: "hour12" | "minute" | "ampm", value: number | string) => {
                  let { hour, minute } = reminderSettings;
                  const currentAmpm = hour < 12 ? "AM" : "PM";
                  let hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

                  if (field === "hour12") hour12 = value as number;
                  if (field === "minute") minute = value as number;
                  const newAmpm = field === "ampm" ? (value as string) : currentAmpm;

                  // Convert 12h → 24h
                  if (newAmpm === "AM") {
                    hour = hour12 === 12 ? 0 : hour12;
                  } else {
                    hour = hour12 === 12 ? 12 : hour12 + 12;
                  }

                  const next: ReminderSettings = { enabled: true, hour, minute };
                  setReminderSettings(next);
                  saveSettings(next);
                  await scheduleReminder(hour, minute);
                };

                return (
                  <div className="rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 overflow-hidden">
                    <div
                      className="flex items-center justify-between px-4 py-3 active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation cursor-pointer"
                      onClick={() => { if (reminderSettings.enabled) setTimePickerOpen(!timePickerOpen); }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                          <Bell className="h-5 w-5 text-primary" />
                        </span>
                        <div>
                          <p className="text-[15px] font-medium text-foreground">Weight Reminder</p>
                          <p className="text-xs text-muted-foreground">
                            {reminderSettings.enabled ? timeLabel : "Off"}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={reminderSettings.enabled}
                        onCheckedChange={handleToggle}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    {timePickerOpen && reminderSettings.enabled && (() => {
                      const curHour24 = reminderSettings.hour;
                      const curHour12 = curHour24 === 0 ? 12 : curHour24 > 12 ? curHour24 - 12 : curHour24;
                      const curAmpm = curHour24 < 12 ? "AM" : "PM";

                      const selectClass = "h-10 rounded-xl bg-background/60 dark:bg-white/5 border border-border/40 text-sm font-medium px-3 appearance-none text-foreground";

                      return (
                        <div className="flex items-center gap-2 px-4 pb-3 pt-1">
                          <select
                            value={curHour12}
                            onChange={(e) => handleTimeChange("hour12", Number(e.target.value))}
                            className={selectClass}
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <span className="text-muted-foreground font-medium">:</span>
                          <select
                            value={reminderSettings.minute}
                            onChange={(e) => handleTimeChange("minute", Number(e.target.value))}
                            className={selectClass}
                          >
                            {[0, 15, 30, 45].map((m) => (
                              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                            ))}
                          </select>
                          <select
                            value={curAmpm}
                            onChange={(e) => handleTimeChange("ampm", e.target.value)}
                            className={selectClass}
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* Replay Tutorial */}
              <button
                type="button"
                onClick={handleReplayTutorial}
                className="w-full rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 overflow-hidden active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation text-left"
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </span>
                    <div>
                      <p className="text-[15px] font-medium text-foreground">Replay Tutorial</p>
                      <p className="text-xs text-muted-foreground">Walk through the app again</p>
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

