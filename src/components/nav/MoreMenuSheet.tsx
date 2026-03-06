import { Settings, LogOut, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { triggerHapticWarning } from "@/lib/haptics";

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

interface MoreMenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MoreMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItems: MoreMenuItem[];
  onItemClick: (url: string) => void;
  onSettings: () => void;
  onLogout: () => void;
}

export function MoreMenuSheet({ open, onOpenChange, menuItems, onItemClick, onSettings, onLogout }: MoreMenuSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[70vh] max-h-[85vh] rounded-t-3xl flex flex-col p-0 gap-0 bg-background/95 dark:bg-background/98 backdrop-blur-md border-t border-border/50 [&>button]:hidden"
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
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.url}
                  type="button"
                  onClick={() => onItemClick(item.url)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 touch-manipulation text-left border-b border-border/40 dark:border-white/5 last:border-b-0"
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
              onClick={onSettings}
              className="w-full flex items-center gap-3 px-4 py-3.5 touch-manipulation text-left border-b border-border/40 dark:border-white/5"
              variants={menuItemVariants}
              transition={menuItemTransition}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted dark:bg-white/10">
                <Settings className="h-5 w-5 text-muted-foreground" />
              </span>
              <span className="flex-1 text-[15px] font-medium text-foreground">Settings</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </motion.button>
            <motion.button
              type="button"
              onClick={() => { onLogout(); triggerHapticWarning(); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 touch-manipulation text-left"
              variants={menuItemVariants}
              transition={menuItemTransition}
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
  );
}
