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
import PullToRefresh from "@/components/PullToRefresh";

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
        setCamps([]); // Set empty array on error to prevent infinite loading
      } else {
        setCamps(data || []);
      }
    } catch (error) {
      console.error("Unexpected error loading fight camps:", error);
      toast({ title: "Error", description: "An unexpected error occurred", variant: "destructive" });
      setCamps([]); // Set empty array on error to prevent infinite loading
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
    <PullToRefresh onRefresh={fetchCamps}>
      <div className="min-h-screen bg-black text-white pb-24">
        <div className="p-4 space-y-6 max-w-md mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Fight Camps</h1>
              <p className="text-zinc-400 text-sm font-medium">History & Performance</p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="icon" className="rounded-full h-10 w-10 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700/50">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:rounded-3xl max-w-sm mx-auto">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">New Fight Camp</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="camp-name" className="text-zinc-400 pl-1">Camp Name</Label>
                    <Input
                      id="camp-name"
                      placeholder="e.g. Summer 2025"
                      value={newCamp.name}
                      onChange={(e) => setNewCamp({ ...newCamp, name: e.target.value })}
                      className="bg-zinc-900 border-transparent text-white h-12 rounded-2xl focus:border-primary focus:ring-1 focus:ring-primary px-4"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="event-name" className="text-zinc-400 pl-1">Event (Optional)</Label>
                    <Input
                      id="event-name"
                      placeholder="e.g. UFC 300"
                      value={newCamp.event_name}
                      onChange={(e) => setNewCamp({ ...newCamp, event_name: e.target.value })}
                      className="bg-zinc-900 border-transparent text-white h-12 rounded-2xl focus:border-primary focus:ring-1 focus:ring-primary px-4"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fight-date" className="text-zinc-400 pl-1">Fight Date</Label>
                    <Input
                      id="fight-date"
                      type="date"
                      value={newCamp.fight_date}
                      onChange={(e) => setNewCamp({ ...newCamp, fight_date: e.target.value })}
                      className="bg-zinc-900 border-transparent text-white h-12 rounded-2xl focus:border-primary focus:ring-1 focus:ring-primary px-4 block w-full"
                    />
                  </div>
                  <Button onClick={handleCreateCamp} className="w-full h-12 rounded-2xl text-base font-bold bg-white text-black hover:bg-zinc-200 mt-2">
                    Create Camp
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Camp List */}
          {camps.length === 0 ? (
            <div className="bg-zinc-900/50 rounded-3xl p-8 border border-zinc-800/50 text-center space-y-4 mt-8 backdrop-blur-sm">
              <div className="h-16 w-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto">
                <Trophy className="w-8 h-8 text-zinc-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">No Camps Yet</h3>
                <p className="text-zinc-400 text-sm mt-1">Start tracking your first preparation.</p>
              </div>
              <Button onClick={() => setDialogOpen(true)} variant="outline" className="rounded-xl border-zinc-700 text-white hover:bg-zinc-800 mt-2">
                Create First Camp
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {camps.map((camp) => (
                <div
                  key={camp.id}
                  className="group relative bg-zinc-900 rounded-3xl p-5 border border-zinc-800/50 active:scale-[0.98] transition-all duration-200 overflow-hidden"
                >
                  <div onClick={() => navigate(`/fight-camps/${camp.id}`)} className="cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-4">
                        {camp.profile_pic_url ? (
                          <img
                            src={camp.profile_pic_url}
                            alt={camp.name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-zinc-800"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-zinc-700/30">
                            <Trophy className="w-5 h-5 text-zinc-400" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold text-lg leading-tight text-white">{camp.name}</h3>
                          {camp.event_name && (
                            <p className="text-sm text-primary font-medium">{camp.event_name}</p>
                          )}
                          <p className="text-xs text-zinc-500 mt-0.5 font-medium">{format(new Date(camp.fight_date), "MMM dd, yyyy")}</p>
                        </div>
                      </div>
                    </div>

                    {/* Metrics Strip */}
                    {(camp.starting_weight_kg || camp.total_weight_cut) ? (
                      <div className="mt-4 bg-zinc-950/50 rounded-2xl p-3 flex items-center justify-around border border-zinc-800/50">
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">Start</p>
                          <p className="text-sm font-bold text-zinc-200">{camp.starting_weight_kg ? `${camp.starting_weight_kg}kg` : '-'}</p>
                        </div>
                        <div className="h-6 w-px bg-zinc-800"></div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">Cut</p>
                          <p className="text-sm font-bold text-primary">{camp.total_weight_cut ? `-${camp.total_weight_cut.toFixed(1)}kg` : '-'}</p>
                        </div>
                        <div className="h-6 w-px bg-zinc-800"></div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-0.5">End</p>
                          <p className="text-sm font-bold text-zinc-200">{camp.end_weight_kg ? `${camp.end_weight_kg}kg` : '-'}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-zinc-600 pl-16">No weight data yet</div>
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
                      className="h-8 w-8 text-zinc-600 hover:text-red-400 hover:bg-zinc-800/50 rounded-full -mr-2 -mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteCamp}
          title="Delete Fight Camp"
          itemName={campToDelete?.name}
        />
      </div>
    </PullToRefresh>
  );
}
