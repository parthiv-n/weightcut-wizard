import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, Plus, Trophy, Trash2, Eye, Scale, Droplets, TrendingDown, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { Badge } from "@/components/ui/badge";

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
      <div className="space-y-6 p-4 sm:p-5 md:p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-5 md:p-6 max-w-7xl mx-auto pb-20 md:pb-6 text-foreground">

        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fight Camps</h1>
            <p className="text-muted-foreground text-sm font-medium">History & Performance</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon" className="rounded-full h-10 w-10 bg-muted hover:bg-muted/80 text-foreground border border-border/50">
                <Plus className="h-5 w-5" />
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
          <div className="glass-card p-8 border border-border/50 text-center space-y-4 mt-8">
            <div className="h-16 w-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mix-blend-screen">
              <Trophy className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">No Camps Yet</h3>
              <p className="text-foreground/80 text-sm mt-1">Start tracking your first preparation.</p>
            </div>
            <Button onClick={() => setDialogOpen(true)} variant="outline" className="rounded-xl mt-2 border-primary/30 hover:bg-primary/10">
              Create First Camp
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {camps.map((camp) => (
              <div
                key={camp.id}
                className="group relative glass-card p-5 active:scale-[0.98] transition-all duration-200 overflow-hidden"
              >
                <div onClick={() => navigate(`/fight-camps/${camp.id}`)} className="cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-4">
                      {camp.profile_pic_url ? (
                        <img
                          src={camp.profile_pic_url}
                          alt={camp.name}
                          className="w-12 h-12 rounded-full object-cover border-2 border-border"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center border-2 border-border/30">
                          <Trophy className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-lg leading-tight text-foreground">{camp.name}</h3>
                        {camp.event_name && (
                          <p className="text-sm text-primary font-medium">{camp.event_name}</p>
                        )}
                        <p className="text-xs text-foreground/80 mt-0.5 font-medium">{format(new Date(camp.fight_date), "MMM dd, yyyy")}</p>
                      </div>
                    </div>
                  </div>

                  {/* Metrics Strip */}
                  {(camp.starting_weight_kg || camp.total_weight_cut) ? (
                    <div className="mt-4 bg-black/20 rounded-2xl p-3 flex items-center justify-around border border-white/5">
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider text-foreground/60 font-bold mb-0.5">Start</p>
                        <p className="text-sm font-bold text-foreground">{camp.starting_weight_kg ? `${camp.starting_weight_kg}kg` : '-'}</p>
                      </div>
                      <div className="h-6 w-px bg-border/30"></div>
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider text-foreground/60 font-bold mb-0.5">Cut</p>
                        <p className="text-sm font-bold text-primary drop-shadow-sm">{camp.total_weight_cut ? `-${camp.total_weight_cut.toFixed(1)}kg` : '-'}</p>
                      </div>
                      <div className="h-6 w-px bg-border/30"></div>
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider text-foreground/60 font-bold mb-0.5">End</p>
                        <p className="text-sm font-bold text-foreground">{camp.end_weight_kg ? `${camp.end_weight_kg}kg` : '-'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-foreground/50 pl-16">No weight data yet</div>
                  )}
                </div>

                <div className="absolute top-4 right-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      initiateDelete(camp);
                    }}
                    className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-muted/50 rounded-full -mr-2 -mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
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
