import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trophy, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

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
  const [camps, setCamps] = useState<FightCamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campToDelete, setCampToDelete] = useState<FightCamp | null>(null);
  const [newCamp, setNewCamp] = useState({
    name: "",
    event_name: "",
    fight_date: "",
  });
  const { toast } = useToast();
  const navigate = useNavigate();
  const { userId } = useUser();

  useEffect(() => {
    if (userId) {
      fetchCamps();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const fetchCamps = async () => {
    if (!userId) return;
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("fight_camps")
        .select("*")
        .eq("user_id", userId)
        .order("fight_date", { ascending: false });

      if (error) {
        console.error("Error loading fight camps:", error);
        toast({ title: "Error", description: "Failed to load fight camps", variant: "destructive" });
        setCamps([]);
      } else {
        setCamps(data || []);
      }
    } catch (error) {
      console.error("Unexpected error loading fight camps:", error);
      toast({ title: "Error", description: "An unexpected error occurred", variant: "destructive" });
      setCamps([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCamp = async () => {
    if (!newCamp.name || !newCamp.fight_date) {
      toast({ title: "Error", description: "Name and fight date are required", variant: "destructive" });
      return;
    }

    if (!userId) return;

    const { error } = await supabase
      .from("fight_camps")
      .insert([{
        user_id: userId,
        name: newCamp.name,
        event_name: newCamp.event_name || null,
        fight_date: newCamp.fight_date,
      }]);

    if (error) {
      toast({ title: "Error", description: "Failed to create fight camp", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Fight camp created successfully" });
      setDialogOpen(false);
      setNewCamp({ name: "", event_name: "", fight_date: "" });
      fetchCamps();
    }
  };

  const handleDeleteCamp = async () => {
    if (!campToDelete) return;

    const { error } = await supabase
      .from("fight_camps")
      .delete()
      .eq("id", campToDelete.id);

    if (error) {
      toast({ title: "Error", description: "Failed to delete fight camp", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Fight camp deleted successfully" });
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
      <div className="space-y-5 px-4 pb-4 pt-16 sm:p-5 sm:pt-16 max-w-2xl mx-auto">
        <Skeleton className="h-7 w-32" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card p-4 space-y-3">
              <div className="flex items-center gap-3.5">
                <Skeleton className="h-11 w-11 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 pb-4 pt-16 sm:p-5 sm:pt-16 max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Fight Camps</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon" className="rounded-full h-9 w-9 bg-muted hover:bg-muted/80 text-foreground border border-border/50">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:rounded-3xl max-w-sm mx-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">New Fight Camp</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="camp-name" className="text-muted-foreground pl-1">Camp Name</Label>
                  <Input
                    id="camp-name"
                    placeholder="e.g. Summer 2025"
                    value={newCamp.name}
                    onChange={(e) => setNewCamp({ ...newCamp, name: e.target.value })}
                    className="h-12 rounded-2xl focus:border-primary focus:ring-1 focus:ring-primary px-4"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-name" className="text-muted-foreground pl-1">Event (Optional)</Label>
                  <Input
                    id="event-name"
                    placeholder="e.g. UFC 300"
                    value={newCamp.event_name}
                    onChange={(e) => setNewCamp({ ...newCamp, event_name: e.target.value })}
                    className="h-12 rounded-2xl focus:border-primary focus:ring-1 focus:ring-primary px-4"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fight-date" className="text-muted-foreground pl-1">Fight Date</Label>
                  <Input
                    id="fight-date"
                    type="date"
                    value={newCamp.fight_date}
                    onChange={(e) => setNewCamp({ ...newCamp, fight_date: e.target.value })}
                    className="h-12 rounded-2xl focus:border-primary focus:ring-1 focus:ring-primary px-4 block w-full"
                  />
                </div>
                <Button onClick={handleCreateCamp} className="w-full h-12 rounded-2xl text-base font-bold mt-2">
                  Create Camp
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Camp List */}
        {camps.length === 0 ? (
          <div className="glass-card p-8 text-center space-y-4">
            <div className="h-14 w-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Trophy className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold">No Camps Yet</h3>
              <p className="text-muted-foreground text-sm mt-1">Start tracking your first preparation.</p>
            </div>
            <Button onClick={() => setDialogOpen(true)} variant="outline" className="rounded-xl mt-2 border-border/50 hover:bg-muted">
              Create First Camp
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {camps.map((camp) => (
              <div
                key={camp.id}
                className="group relative glass-card p-4 active:scale-[0.98] transition-all duration-200 overflow-hidden"
              >
                <div onClick={() => navigate(`/fight-camps/${camp.id}`)} className="cursor-pointer">
                  <div className="flex items-start gap-3.5">
                    {camp.profile_pic_url ? (
                      <img
                        src={camp.profile_pic_url}
                        alt={camp.name}
                        className="w-11 h-11 rounded-full object-cover border border-border/50 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center border border-border/50 shrink-0">
                        <Trophy className="w-4.5 h-4.5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-base leading-tight">{camp.name}</h3>
                      {camp.event_name && (
                        <p className="text-sm text-primary font-medium truncate">{camp.event_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(camp.fight_date), "MMM dd, yyyy")}</p>
                    </div>
                  </div>

                  {/* Metrics Strip */}
                  {(camp.starting_weight_kg || camp.total_weight_cut) ? (
                    <div className="mt-3 bg-muted/50 rounded-xl p-2.5 flex items-center justify-around border border-border/30">
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Start</p>
                        <p className="text-sm font-bold">{camp.starting_weight_kg ? `${camp.starting_weight_kg}kg` : '-'}</p>
                      </div>
                      <div className="h-5 w-px bg-border/50" />
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Cut</p>
                        <p className="text-sm font-bold text-primary">{camp.total_weight_cut ? `-${camp.total_weight_cut.toFixed(1)}kg` : '-'}</p>
                      </div>
                      <div className="h-5 w-px bg-border/50" />
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">End</p>
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
    </div>
  );
}
