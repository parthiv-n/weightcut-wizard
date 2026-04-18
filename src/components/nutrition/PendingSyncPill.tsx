import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, X, Loader2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import {
  listPendingMeals,
  subscribePendingMeals,
  retryAllMeals,
  retryMeal,
  dropMeal,
  type PendingMealSummary,
} from "@/lib/pendingMeals";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function PendingSyncPill() {
  const { userId } = useUser();
  const [items, setItems] = useState<PendingMealSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!userId) { setItems([]); return; }
    const refresh = () => setItems(listPendingMeals(userId));
    refresh();
    return subscribePendingMeals(refresh);
  }, [userId]);

  if (!userId || items.length === 0) return null;

  const failedCount = items.filter(i => i.failed).length;
  const label = failedCount > 0
    ? `${failedCount} failed · tap to retry`
    : `${items.length} syncing…`;

  const handleRetryAll = async () => {
    if (!userId || retrying) return;
    setRetrying(true);
    try { await retryAllMeals(userId); } finally { setRetrying(false); }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[11px] font-medium border ${
          failedCount > 0
            ? "bg-destructive/10 text-destructive border-destructive/30"
            : "bg-muted/60 text-muted-foreground border-border/50"
        }`}
        role="status"
        aria-live="polite"
      >
        {failedCount > 0 ? <CloudOff className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
        {label}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Pending meals</SheetTitle>
          </SheetHeader>

          <div className="mt-3 space-y-1.5">
            {items.map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.mealName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {item.action === "delete" ? "Delete · " : ""}
                    {item.mealType} · {item.calories} kcal
                    {item.failed && <span className="text-destructive ml-1">· failed ({item.retries} tries)</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {item.failed && userId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Retry this meal"
                      onClick={() => retryMeal(userId, item.id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {userId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground"
                      aria-label="Drop this meal from the queue"
                      onClick={() => dropMeal(userId, item.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {failedCount > 0 && (
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={handleRetryAll}
                disabled={retrying}
              >
                {retrying ? "Retrying…" : `Retry all (${failedCount})`}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
