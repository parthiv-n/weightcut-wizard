import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth, useUser, useProfile } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { globalLoading } from "@/lib/globalLoading";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoachSettingsSheet({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut } = useAuth();
  const { userId } = useUser();
  const { userName, setUserName } = useProfile();
  const [editedName, setEditedName] = useState(userName);
  const [savingName, setSavingName] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSaveName = async () => {
    if (!userId || !editedName.trim() || editedName === userName) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: editedName.trim() })
        .eq("id", userId);
      if (error) throw error;
      setUserName(editedName.trim());
      toast({ title: "Name updated" });
    } catch (err: any) {
      logger.error("CoachSettings: save name failed", err);
      toast({ title: "Could not update name", variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    globalLoading.show("Signing out…");
    try {
      await signOut();
      onOpenChange(false);
      setLogoutOpen(false);
      navigate("/auth");
      globalLoading.hideAfterPaint();
      toast({ title: "Signed out" });
    } catch {
      globalLoading.hide();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    globalLoading.show("Deleting account…", "This may take a moment");
    try {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      await supabase.auth.signOut();
      onOpenChange(false);
      setDeleteOpen(false);
      navigate("/auth");
      globalLoading.hideAfterPaint();
      toast({ title: "Account deleted" });
    } catch (err: any) {
      logger.error("CoachSettings: delete failed", err);
      globalLoading.hide();
      toast({ title: "Could not delete account", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] [&>button]:hidden"
        >
          <div className="flex justify-center pt-1 pb-3">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/25" aria-hidden />
          </div>
          <SheetHeader className="px-1 pb-3">
            <SheetTitle className="text-base font-semibold">Settings</SheetTitle>
          </SheetHeader>

          <div className="space-y-3 px-1">
            {/* Name */}
            <div className="card-surface rounded-2xl border border-border p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Name</p>
              <div className="flex items-center gap-2">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  placeholder="Your name"
                  className="h-10 rounded-xl bg-muted/40 border-border/30 text-[14px]"
                />
                <button
                  onClick={() => { triggerHaptic(ImpactStyle.Light); handleSaveName(); }}
                  disabled={savingName || !editedName.trim() || editedName === userName}
                  className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold active:scale-95 transition-transform disabled:opacity-40"
                >
                  {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </button>
              </div>
            </div>

            {/* Theme */}
            <div className="card-surface rounded-2xl border border-border p-3 flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium">Theme</p>
                <p className="text-[11px] text-muted-foreground">Light or dark</p>
              </div>
              <ThemeToggle />
            </div>

            {/* Sign out */}
            <button
              onClick={() => setLogoutOpen(true)}
              className="w-full card-surface rounded-2xl border border-border p-3 text-left active:bg-muted/30 transition-colors"
            >
              <p className="text-[13px] font-medium">Sign out</p>
            </button>

            {/* Delete account — destructive, distinct treatment */}
            <button
              onClick={() => setDeleteOpen(true)}
              className="w-full rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-left active:bg-destructive/10 transition-colors"
            >
              <p className="text-[13px] font-medium text-destructive">Delete account</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Permanently removes your account, gym, and all data.</p>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sign out confirm */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">Sign out?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              You'll need your email and password to sign back in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-center sm:justify-center gap-2">
            <AlertDialogCancel disabled={loggingOut} className="mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete account confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account, your gym, and removes all athletes from it.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
