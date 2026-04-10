import { useSubscription } from "@/hooks/useSubscription";
import { useGems } from "@/hooks/useGems";
import { useAuth } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NoGemsDialog } from "./NoGemsDialog";

export function NoGemsOverlay() {
  const { isNoGemsOpen, closeNoGemsDialog, openPaywall, onAICallBlocked } = useSubscription();
  const { adsRemaining, loading, watchAdForGem } = useGems();
  const { userId } = useAuth();
  const { toast } = useToast();

  const handleWatchAd = async () => {
    const success = await watchAdForGem();
    if (success) closeNoGemsDialog();
  };

  const handleGoPro = () => {
    closeNoGemsDialog();
    openPaywall();
  };

  // TEST ONLY — adds 1 gem directly, updates client state without refreshProfile
  const handleAddGem = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("profiles")
      .select("gems")
      .eq("id", userId)
      .single();
    const currentGems = data?.gems ?? 0;
    const newGems = currentGems + 1;
    const { error } = await supabase
      .from("profiles")
      .update({ gems: newGems })
      .eq("id", userId);
    if (error) {
      toast({ title: "Error", description: "Failed to add gem", variant: "destructive" });
      return;
    }
    // Sync client state directly — avoids refreshProfile timeout
    localStorage.setItem("wcw_gems", String(newGems));
    onAICallBlocked(newGems); // reuses the sync mechanism to push server gems into context
    toast({ title: "Gem added!", description: `You now have ${newGems} gems.` });
    closeNoGemsDialog();
  };

  return (
    <NoGemsDialog
      open={isNoGemsOpen}
      onOpenChange={(open) => { if (!open) closeNoGemsDialog(); }}
      onWatchAd={handleWatchAd}
      onGoPro={handleGoPro}
      onAddGem={handleAddGem}
      adsRemaining={adsRemaining}
      loading={loading}
    />
  );
}
