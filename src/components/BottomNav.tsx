import { Home, Utensils, Plus, Weight, Target, MoreHorizontal, Sparkles, Trophy, Settings, LogOut, Droplets, Calendar, Moon, Sun } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
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
import { Label } from "@/components/ui/label";
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
  { title: "AI Wizard", url: "/wizard", icon: Sparkles },
  { title: "Fight Camps", url: "/fight-camps", icon: Trophy },
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

  useEffect(() => {
    setEditedName(userName);
  }, [userName]);

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
          <div className="grid gap-4 py-4">
            <Button
              onClick={handleLogFood}
              size="lg"
              className="h-20 flex flex-col items-center justify-center gap-2"
              variant="outline"
            >
              <Utensils className="h-8 w-8" />
              <span className="text-lg font-semibold">Log Food</span>
            </Button>
            <Button
              onClick={handleLogWeight}
              size="lg"
              className="h-20 flex flex-col items-center justify-center gap-2"
              variant="outline"
            >
              <Weight className="h-8 w-8" />
              <span className="text-lg font-semibold">Log Weight</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* More Menu Sheet */}
      <Sheet open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
        <SheetContent side="bottom" className="h-[60vh] rounded-t-2xl flex flex-col">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-2 overflow-y-auto flex-1 pb-24">
            {moreMenuItems.map((item) => (
              <button
                key={item.url}
                onClick={() => handleMoreItemClick(item.url)}
                className="w-full flex items-center gap-4 p-4 rounded-lg hover:bg-accent active:bg-accent/80 transition-colors touch-target text-left"
              >
                <item.icon className="h-6 w-6 text-muted-foreground" />
                <span className="text-base font-medium">{item.title}</span>
              </button>
            ))}
            <div className="border-t my-2"></div>
            <button
              onClick={handleSettings}
              className="w-full flex items-center gap-4 p-4 rounded-lg hover:bg-accent active:bg-accent/80 transition-colors touch-target text-left"
            >
              <Settings className="h-6 w-6 text-muted-foreground" />
              <span className="text-base font-medium">Settings</span>
            </button>
            <button
              onClick={() => setLogoutDialogOpen(true)}
              className="w-full flex items-center gap-4 p-4 rounded-lg hover:bg-destructive/10 active:bg-destructive/20 transition-colors touch-target text-left text-destructive"
            >
              <LogOut className="h-6 w-6" />
              <span className="text-base font-medium">Logout</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center gap-4">
              <ProfilePictureUpload
                currentAvatarUrl={avatarUrl || undefined}
                onUploadSuccess={(url) => {
                  setAvatarUrl(url);
                  toast({
                    description: "Profile picture updated successfully",
                  });
                }}
              />
            </div>
            {/* Theme Toggle */}
            <div className="flex items-center justify-between py-3 px-1 border-b border-border/50">
              <div>
                <p className="text-sm font-medium">Appearance</p>
                <p className="text-xs text-muted-foreground">Toggle dark / light mode</p>
              </div>
              <ThemeToggle />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSettingsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleUpdateProfile}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out? You'll need to sign in again to access your data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

