import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trophy, Trash2, GitCompareArrows, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { localCache } from "@/lib/localCache";
import { ShareCardDialog } from "@/components/share/ShareCardDialog";
import { CampComparisonCard } from "@/components/share/cards/CampComparisonCard";
import { logger } from "@/lib/logger";

interface FightCamp {
  id: string;
  name: string;
  event_name: string | null;
  fight_date: string;
  profile_pic_url: string | null;
  is_completed: boolean;
  starting_weight_kg: number | null;
  end_weight_kg: number | null;
  total_weight_cut: number | null;
  weight_via_dehydration: number | null;
  weight_via_carb_reduction: number | null;
  weigh_in_timing: string | null;
}

export default function FightCamps() {
  const { userId } = useAuth();
  const [camps, setCamps] = useState<FightCamp[]>(() => {
    if (!userId) return [];
    return localCache.get<FightCamp[]>(userId, 'fight_camps', 30 * 60 * 1000) || [];
  });
  const [loading, setLoading] = useState(() => {
    if (!userId) return true;
    return localCache.get(userId, 'fight_camps', 30 * 60 * 1000) === null;
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campToDelete, setCampToDelete] = useState<FightCamp | null>(null);
  const [newCamp, setNewCamp] = useState({
    name: "",
    event_name: "",
    fight_date: "",
  });
  const [compareMode, setCompareMode] = useState(false);
  const [selectedCamps, setSelectedCamps] = useState<string[]>([]);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { safeAsync, isMounted } = useSafeAsync();

  useEffect(() => {
    if (userId) {
      fetchCamps();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const fetchCamps = async (isRetry = false) => {
    if (!userId) return;

    const cached = localCache.get<FightCamp[]>(userId, 'fight_camps', 30 * 60 * 1000);
    if (cached) {
      safeAsync(setCamps)(cached);
      safeAsync(setLoading)(false);
    }

    try {
      const { data, error } = await withSupabaseTimeout(
        supabase
          .from("fight_camps")
          .select("id, name, event_name, fight_date, profile_pic_url, is_completed, starting_weight_kg, end_weight_kg, total_weight_cut, weight_via_dehydration, weight_via_carb_reduction, weigh_in_timing")
          .eq("user_id", userId)
          .order("fight_date", { ascending: false })
          .limit(50),
        undefined,
        "Load fight camps"
      );

      if (!isMounted()) return;

      if (error) throw error;

      safeAsync(setCamps)((data || []) as FightCamp[]);
      localCache.set(userId, 'fight_camps', data || []);
    } catch (error) {
      logger.warn("Error loading fight camps", { error });

      if (!isRetry) {
        setTimeout(() => { if (isMounted()) fetchCamps(true); }, 2000);
        return;
      }

      if (!cached) {
        if (isMounted()) {
          toast({ title: "Couldn't load fight camps", description: "Check your connection and try again.", variant: "destructive" });
        }
      }
    } finally {
      safeAsync(setLoading)(false);
    }
  };

  const handleCreateCamp = async () => {
    if (!newCamp.name || !newCamp.fight_date) {
      toast({ title: "Error", description: "Name and fight date are required", variant: "destructive" });
      return;
    }

    if (!userId) return;

    const { error } = await withSupabaseTimeout(
      supabase
        .from("fight_camps")
        .insert([{
          user_id: userId,
          name: newCamp.name,
          event_name: newCamp.event_name || null,
          fight_date: newCamp.fight_date,
        }]),
      undefined,
      "Create fight camp"
    );

    if (error) {
      toast({ title: "Error", description: "Failed to create fight camp", variant: "destructive" });
    } else {
      setDialogOpen(false);
      setNewCamp({ name: "", event_name: "", fight_date: "" });
      localCache.remove(userId, 'fight_camps');
      fetchCamps();
    }
  };

  const handleDeleteCamp = async () => {
    if (!campToDelete) return;

    const { error } = await withSupabaseTimeout(
      supabase
        .from("fight_camps")
        .delete()
        .eq("id", campToDelete.id),
      undefined,
      "Delete fight camp"
    );

    if (error) {
      toast({ title: "Error", description: "Failed to delete fight camp", variant: "destructive" });
    } else {
      if (userId) localCache.remove(userId, 'fight_camps');
      fetchCamps();
    }
    setDeleteDialogOpen(false);
    setCampToDelete(null);
  };

  const initiateDelete = (camp: FightCamp) => {
    setCampToDelete(camp);
    setDeleteDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-2xl mx-auto">
        <Skeleton className="h-7 w-32" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-surface p-4 space-y-3">
              <div className="flex items-center gap-3.5">
                <Skeleton className="h-11 w-11 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-12 w-full rounded-2xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-page-in space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{compareMode ? "Compare Camps" : "Fight Camps"}</h1>
          <div className="flex items-center gap-1.5">
            {camps.length >= 2 && (
              <Button
                size="icon"
                variant={compareMode ? "default" : "ghost"}
                aria-label={compareMode ? "Exit compare mode" : "Compare camps"}
                onClick={() => {
                  setCompareMode(!compareMode);
                  setSelectedCamps([]);
                }}
                className="rounded-full h-8 w-8"
              >
                {compareMode ? <X className="h-4 w-4" /> : <GitCompareArrows className="h-4 w-4" />}
              </Button>
            )}
            <button
              onClick={() => setDialogOpen(true)}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
              aria-label="New fight camp"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Compare mode hint */}
        {compareMode && (
          <p className="text-sm text-muted-foreground">
            Select 2 camps to compare ({selectedCamps.length}/2)
          </p>
        )}

        {/* Camp List */}
        {camps.length === 0 ? (
          <div className="card-surface p-6 text-center space-y-3">
            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold">No Camps Yet</h3>
              <p className="text-muted-foreground text-xs mt-0.5">Start tracking your first preparation.</p>
            </div>
            <Button onClick={() => setDialogOpen(true)} variant="outline" className="rounded-2xl mt-2 border-border hover:bg-muted">
              Create First Camp
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {camps.map((camp) => (
              <div
                key={camp.id}
                className={`group relative card-surface p-4 active:scale-[0.98] transition-all duration-200 overflow-hidden ${
                  compareMode && selectedCamps.includes(camp.id) ? "ring-2 ring-primary" : ""
                }`}
              >
                <div onClick={() => {
                  if (compareMode) {
                    setSelectedCamps((prev) => {
                      if (prev.includes(camp.id)) return prev.filter((id) => id !== camp.id);
                      if (prev.length >= 2) return prev;
                      const next = [...prev, camp.id];
                      if (next.length === 2) setCompareDialogOpen(true);
                      return next;
                    });
                  } else {
                    navigate(`/fight-camps/${camp.id}`);
                  }
                }} className="cursor-pointer">
                  <div className="flex items-start gap-3">
                    {camp.profile_pic_url ? (
                      <img
                        src={camp.profile_pic_url}
                        alt={camp.name}
                        className="w-9 h-9 rounded-full object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center border border-border shrink-0">
                        <Trophy className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm leading-tight">{camp.name}</h3>
                      {camp.event_name && (
                        <p className="text-xs text-primary font-medium truncate">{camp.event_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(camp.fight_date), "MMM dd, yyyy")}</p>
                    </div>
                  </div>

                  {/* Metrics Strip */}
                  {(camp.starting_weight_kg || camp.total_weight_cut) ? (
                    <div className="mt-3 bg-muted/50 rounded-2xl p-2.5 flex items-center justify-around border border-border">
                      <div className="text-center">
                        <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-0.5">Start</p>
                        <p className="text-sm font-bold">{camp.starting_weight_kg ? `${camp.starting_weight_kg}kg` : '-'}</p>
                      </div>
                      <div className="h-5 w-px bg-border" />
                      <div className="text-center">
                        <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-0.5">Cut</p>
                        <p className="text-sm font-bold text-primary">{camp.total_weight_cut ? `-${camp.total_weight_cut.toFixed(1)}kg` : '-'}</p>
                      </div>
                      <div className="h-5 w-px bg-border" />
                      <div className="text-center">
                        <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-0.5">End</p>
                        <p className="text-sm font-bold">{camp.end_weight_kg ? `${camp.end_weight_kg}kg` : '-'}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground pl-[3.25rem]">No weight data yet</p>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    initiateDelete(camp);
                  }}
                  aria-label="Delete camp"
                  className="absolute top-3 right-3 h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-muted/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteCamp}
        title="Delete Fight Camp"
        itemName={campToDelete?.name}
      />

      {/* New Camp Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-2.5rem)] max-w-[320px] rounded-[28px] p-0 border-0 bg-card/95 backdrop-blur-xl shadow-2xl gap-0">
          <div className="px-4 pt-4 pb-3">
            <DialogHeader>
              <DialogTitle className="text-[15px] font-semibold text-center">New Fight Camp</DialogTitle>
            </DialogHeader>
          </div>
          <div className="px-4 space-y-2.5">
            <div className="space-y-1">
              <Label htmlFor="camp-name" className="text-muted-foreground pl-0.5 text-[13px]">Camp Name</Label>
              <Input
                id="camp-name"
                placeholder="e.g. Summer 2025"
                value={newCamp.name}
                onChange={(e) => setNewCamp({ ...newCamp, name: e.target.value })}
                className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="event-name" className="text-muted-foreground pl-0.5 text-[13px]">Event (Optional)</Label>
              <Input
                id="event-name"
                placeholder="e.g. UFC 300"
                value={newCamp.event_name}
                onChange={(e) => setNewCamp({ ...newCamp, event_name: e.target.value })}
                className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fight-date" className="text-muted-foreground pl-0.5 text-[13px]">Fight Date</Label>
              <Input
                id="fight-date"
                type="date"
                value={newCamp.fight_date}
                onChange={(e) => setNewCamp({ ...newCamp, fight_date: e.target.value })}
                className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20 block w-full"
              />
            </div>
          </div>
          <div className="border-t border-border/40 mt-3">
            <button onClick={handleCreateCamp} className="w-full py-2.5 text-[14px] font-semibold text-primary active:bg-muted/50 transition-colors">
              Create Camp
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camp comparison share dialog */}
      {selectedCamps.length === 2 && (() => {
        const campA = camps.find((c) => c.id === selectedCamps[0]);
        const campB = camps.find((c) => c.id === selectedCamps[1]);
        if (!campA || !campB) return null;
        return (
          <ShareCardDialog
            open={compareDialogOpen}
            onOpenChange={(open) => {
              setCompareDialogOpen(open);
              if (!open) {
                setSelectedCamps([]);
                setCompareMode(false);
              }
            }}
            title="Compare Camps"
            shareTitle="Camp Comparison"
            shareText="Check out my camp comparison on FightCamp Wizard"
          >
            {({ cardRef, aspect }) => (
              <CampComparisonCard ref={cardRef} campA={campA} campB={campB} aspect={aspect} />
            )}
          </ShareCardDialog>
        );
      })()}
    </div>
  );
}
