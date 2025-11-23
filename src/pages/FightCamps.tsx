import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
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

  useEffect(() => {
    fetchCamps();
  }, []);

  const fetchCamps = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data, error } = await supabase
      .from("fight_camps")
      .select("*")
      .eq("user_id", user.id)
      .order("fight_date", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Failed to load fight camps", variant: "destructive" });
    } else {
      setCamps(data || []);
    }
    setLoading(false);
  };

  const handleCreateCamp = async () => {
    if (!newCamp.name || !newCamp.fight_date) {
      toast({ title: "Error", description: "Name and fight date are required", variant: "destructive" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("fight_camps")
      .insert([{
        user_id: user.id,
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
      <div className="space-y-6 p-6">
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
    <div className="space-y-6 p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Trophy className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-title font-bold">Fight Camps</h1>
            <p className="text-muted-foreground">Manage and track your fight camps</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Camp
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Fight Camp</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="camp-name">Camp Name *</Label>
                <Input
                  id="camp-name"
                  placeholder="e.g., Summer 2025 Camp"
                  value={newCamp.name}
                  onChange={(e) => setNewCamp({ ...newCamp, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-name">Event Name</Label>
                <Input
                  id="event-name"
                  placeholder="e.g., UFC 300, Glory 85"
                  value={newCamp.event_name}
                  onChange={(e) => setNewCamp({ ...newCamp, event_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fight-date">Fight Date *</Label>
                <Input
                  id="fight-date"
                  type="date"
                  value={newCamp.fight_date}
                  onChange={(e) => setNewCamp({ ...newCamp, fight_date: e.target.value })}
                />
              </div>
              <Button onClick={handleCreateCamp} className="w-full">
                Create Camp
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {camps.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Fight Camps Yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first fight camp to start tracking your weight cuts and performance
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Camp
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {camps.map((camp) => (
            <Card key={camp.id} className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {camp.profile_pic_url ? (
                      <img
                        src={camp.profile_pic_url}
                        alt={camp.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Trophy className="w-6 h-6 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{camp.name}</CardTitle>
                      {camp.event_name && (
                        <p className="text-sm text-muted-foreground truncate">{camp.event_name}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => initiateDelete(camp)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{format(new Date(camp.fight_date), "MMM dd, yyyy")}</span>
                  {camp.weigh_in_timing && (
                    <Badge variant="outline" className="ml-auto text-xs">
                      {camp.weigh_in_timing === 'day_before' ? 'Day Before' : 'Day Of'}
                    </Badge>
                  )}
                </div>

                {camp.starting_weight_kg || camp.total_weight_cut ? (
                  <div className="space-y-2 pt-2 border-t">
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Scale className="w-3 h-3" />
                      Weight Cut Summary
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {camp.starting_weight_kg && (
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Starting</p>
                          <p className="font-semibold text-foreground">{camp.starting_weight_kg}kg</p>
                        </div>
                      )}
                      {camp.end_weight_kg && (
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Ending</p>
                          <p className="font-semibold text-foreground">{camp.end_weight_kg}kg</p>
                        </div>
                      )}
                      {camp.total_weight_cut && (
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground flex items-center gap-1">
                            <TrendingDown className="w-3 h-3 text-primary" />
                            Total Cut
                          </p>
                          <p className="font-semibold text-primary">{camp.total_weight_cut.toFixed(1)}kg</p>
                        </div>
                      )}
                      {camp.weight_via_dehydration && (
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground flex items-center gap-1">
                            <Droplets className="w-3 h-3 text-blue-500" />
                            Dehydration
                          </p>
                          <p className="font-semibold text-blue-600 dark:text-blue-400">{camp.weight_via_dehydration.toFixed(1)}kg</p>
                        </div>
                      )}
                      {camp.weight_via_carb_reduction && (
                        <div className="space-y-0.5 col-span-2">
                          <p className="text-muted-foreground flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Carb Reduction
                          </p>
                          <p className="font-semibold">{camp.weight_via_carb_reduction.toFixed(1)}kg</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic py-2">
                    No weight cut data recorded yet
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(`/fight-camps/${camp.id}`)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </Button>
              </CardContent>
            </Card>
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
