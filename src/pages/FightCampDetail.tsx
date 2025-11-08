import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Upload, Trophy, Scale, Droplets, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface FightCamp {
  id: string;
  name: string;
  event_name: string | null;
  fight_date: string;
  profile_pic_url: string | null;
  starting_weight_kg: number | null;
  end_weight_kg: number | null;
  total_weight_cut: number | null;
  weight_via_dehydration: number | null;
  weight_via_carb_reduction: number | null;
  weigh_in_timing: string | null;
  rehydration_notes: string | null;
  performance_feeling: string | null;
  is_completed: boolean;
}

export default function FightCampDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [camp, setCamp] = useState<FightCamp | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchCampDetails();
  }, [id]);

  const fetchCampDetails = async () => {
    if (!id) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("fight_camps")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to load fight camp", variant: "destructive" });
      navigate("/fight-camps");
    } else {
      setCamp(data);
    }
    setLoading(false);
  };

  const handleUpdate = async () => {
    if (!camp) return;

    const { error } = await supabase
      .from("fight_camps")
      .update({
        starting_weight_kg: camp.starting_weight_kg,
        end_weight_kg: camp.end_weight_kg,
        total_weight_cut: camp.total_weight_cut,
        weight_via_dehydration: camp.weight_via_dehydration,
        weight_via_carb_reduction: camp.weight_via_carb_reduction,
        weigh_in_timing: camp.weigh_in_timing,
        rehydration_notes: camp.rehydration_notes,
        performance_feeling: camp.performance_feeling,
        is_completed: camp.is_completed,
      })
      .eq("id", camp.id);

    if (error) {
      toast({ title: "Error", description: "Failed to update camp", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Camp updated successfully" });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !camp) return;

    const file = e.target.files[0];
    setUploading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/fight-camp-${camp.id}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Error", description: "Failed to upload image", variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);

    const { error: updateError } = await supabase
      .from("fight_camps")
      .update({ profile_pic_url: data.publicUrl })
      .eq("id", camp.id);

    if (updateError) {
      toast({ title: "Error", description: "Failed to update profile picture", variant: "destructive" });
    } else {
      setCamp({ ...camp, profile_pic_url: data.publicUrl });
      toast({ title: "Success", description: "Profile picture updated" });
    }
    setUploading(false);
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!camp) return null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fight-camps")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <Trophy className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-title font-bold">{camp.name}</h1>
            <p className="text-muted-foreground">
              {camp.event_name && `${camp.event_name} • `}
              {format(new Date(camp.fight_date), "MMMM dd, yyyy")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Picture */}
        <Card>
          <CardHeader>
            <CardTitle>Camp Picture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              {camp.profile_pic_url ? (
                <img
                  src={camp.profile_pic_url}
                  alt="Fight camp"
                  className="w-40 h-40 rounded-lg object-cover"
                />
              ) : (
                <div className="w-40 h-40 rounded-lg bg-muted flex items-center justify-center">
                  <Trophy className="w-16 h-16 text-muted-foreground" />
                </div>
              )}
            </div>
            <div>
              <Input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Upload a picture for this fight camp
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Weight Summary */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5" />
              Weight Cut Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starting Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={camp.starting_weight_kg || ""}
                  onChange={(e) => setCamp({ ...camp, starting_weight_kg: parseFloat(e.target.value) || null })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={camp.end_weight_kg || ""}
                  onChange={(e) => setCamp({ ...camp, end_weight_kg: parseFloat(e.target.value) || null })}
                />
              </div>
              <div className="space-y-2">
                <Label>Total Weight Cut (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={camp.total_weight_cut || ""}
                  onChange={(e) => setCamp({ ...camp, total_weight_cut: parseFloat(e.target.value) || null })}
                />
              </div>
              <div className="space-y-2">
                <Label>Weigh-In Timing</Label>
                <Select
                  value={camp.weigh_in_timing || ""}
                  onValueChange={(value: "day_before" | "day_of") => setCamp({ ...camp, weigh_in_timing: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timing" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day_before">Day Before Fight</SelectItem>
                    <SelectItem value="day_of">Day of Fight</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weight Cut Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            Weight Cut Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-500" />
                Weight via Dehydration (kg)
              </Label>
              <Input
                type="number"
                step="0.1"
                value={camp.weight_via_dehydration || ""}
                onChange={(e) => setCamp({ ...camp, weight_via_dehydration: parseFloat(e.target.value) || null })}
              />
            </div>
            <div className="space-y-2">
              <Label>Weight via Carb Reduction (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={camp.weight_via_carb_reduction || ""}
                onChange={(e) => setCamp({ ...camp, weight_via_carb_reduction: parseFloat(e.target.value) || null })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Notes */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rehydration Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="How did rehydration go? What worked well? What would you change?"
              value={camp.rehydration_notes || ""}
              onChange={(e) => setCamp({ ...camp, rehydration_notes: e.target.value })}
              rows={6}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Feeling</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="How did you feel on fight day? Energy levels, strength, mental clarity?"
              value={camp.performance_feeling || ""}
              onChange={(e) => setCamp({ ...camp, performance_feeling: e.target.value })}
              rows={6}
            />
          </CardContent>
        </Card>
      </div>

      {/* Completion Status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="completed"
                checked={camp.is_completed}
                onChange={(e) => setCamp({ ...camp, is_completed: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="completed" className="cursor-pointer">
                Mark this camp as completed
              </Label>
            </div>
            <Button onClick={handleUpdate}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
