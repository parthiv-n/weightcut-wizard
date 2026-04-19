import { Settings, LogOut, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { triggerHapticWarning } from "@/lib/haptics";

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
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="bottom"
        className="h-[70vh] max-h-[85vh] rounded-t-2xl flex flex-col p-0 gap-0 bg-background border-t border-border [&>button]:hidden"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/25" aria-hidden />
        </div>
        <SheetHeader className="px-5 pb-2 pt-1 text-left shrink-0">
          <SheetTitle className="text-lg font-semibold text-foreground">More</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 scrollbar-hide scroll-touch overscroll-contain" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}>
          {/* Nav links group */}
          <div className="rounded-2xl bg-muted/40 dark:bg-muted overflow-hidden border border-border">
            {menuItems.map((item) => (
              <button
                key={item.url}
                type="button"
                onClick={() => onItemClick(item.url)}
                className="w-full flex items-center gap-3 px-4 py-3 touch-manipulation text-left border-b border-border last:border-b-0 active:bg-muted/60 transition-colors duration-100"
              >
                <span className="flex-1 text-[15px] font-medium text-foreground">{item.title}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              </button>
            ))}
          </div>

          {/* Settings & Logout group */}
          <div className="mt-3 rounded-2xl bg-muted/40 dark:bg-muted overflow-hidden border border-border">
            <button
              type="button"
              onClick={onSettings}
              className="w-full flex items-center gap-3 px-4 py-3 touch-manipulation text-left border-b border-border active:bg-muted/60 transition-colors duration-100"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted-foreground/10">
                <Settings className="h-[18px] w-[18px] text-muted-foreground" />
              </span>
              <span className="flex-1 text-[15px] font-medium text-foreground">Settings</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            </button>
            <button
              type="button"
              onClick={() => { onLogout(); triggerHapticWarning(); }}
              className="w-full flex items-center gap-3 px-4 py-3 touch-manipulation text-left active:bg-muted/60 transition-colors duration-100"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <LogOut className="h-[18px] w-[18px] text-destructive" />
              </span>
              <span className="flex-1 text-[15px] font-medium text-destructive">Log out</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
