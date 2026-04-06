import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { WelcomeProDialog } from "./WelcomeProDialog";

export function WelcomeProOverlay() {
  const { showWelcomePro, dismissWelcomePro } = useSubscriptionContext();
  return <WelcomeProDialog open={showWelcomePro} onClose={dismissWelcomePro} />;
}
