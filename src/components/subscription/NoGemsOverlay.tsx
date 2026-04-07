import { useSubscription } from "@/hooks/useSubscription";
import { useGems } from "@/hooks/useGems";
import { NoGemsDialog } from "./NoGemsDialog";

export function NoGemsOverlay() {
  const { isNoGemsOpen, closeNoGemsDialog, openPaywall } = useSubscription();
  const { adsRemaining, loading, watchAdForGem } = useGems();

  const handleWatchAd = async () => {
    const success = await watchAdForGem();
    if (success) closeNoGemsDialog();
  };

  const handleGoPro = () => {
    closeNoGemsDialog();
    openPaywall();
  };

  return (
    <NoGemsDialog
      open={isNoGemsOpen}
      onOpenChange={(open) => { if (!open) closeNoGemsDialog(); }}
      onWatchAd={handleWatchAd}
      onGoPro={handleGoPro}
      adsRemaining={adsRemaining}
      loading={loading}
    />
  );
}
