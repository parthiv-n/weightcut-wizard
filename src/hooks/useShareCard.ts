import { useRef, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { captureCardAsBlob, downloadCardImage, shareCardImage } from "@/lib/shareUtils";
import { logger } from "@/lib/logger";

export function useShareCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const { toast } = useToast();

  const captureAndDownload = useCallback(async (filename?: string, transparent?: boolean) => {
    if (!cardRef.current) return;
    setIsCapturing(true);
    try {
      const blob = await captureCardAsBlob(cardRef.current, { transparent });
      downloadCardImage(blob, filename ?? `weightcut-wizard-${Date.now()}.png`);
    } catch (e) {
      logger.error("Capture failed", e);
      toast({ title: "Failed to capture image", variant: "destructive" });
    } finally {
      setIsCapturing(false);
    }
  }, [toast]);

  const captureAndShare = useCallback(async (title?: string, text?: string, transparent?: boolean) => {
    if (!cardRef.current) return;
    setIsCapturing(true);
    try {
      const blob = await captureCardAsBlob(cardRef.current, { transparent });
      await shareCardImage(
        blob,
        title ?? "FightCamp Wizard",
        text ?? "Check out my stats on FightCamp Wizard"
      );
    } catch (e) {
      logger.error("Share failed", e);
      toast({ title: "Failed to share image", variant: "destructive" });
    } finally {
      setIsCapturing(false);
    }
  }, [toast]);

  return { cardRef, isCapturing, captureAndDownload, captureAndShare };
}
