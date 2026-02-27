import { useRef, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { captureCardAsBlob, downloadCardImage, shareCardImage } from "@/lib/shareUtils";

export function useShareCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const { toast } = useToast();

  const captureAndDownload = useCallback(async (filename?: string) => {
    if (!cardRef.current) return;
    setIsCapturing(true);
    try {
      const blob = await captureCardAsBlob(cardRef.current);
      downloadCardImage(blob, filename ?? `weightcut-wizard-${Date.now()}.png`);
      toast({ title: "Image saved" });
    } catch (e) {
      console.error("Capture failed:", e);
      toast({ title: "Failed to capture image", variant: "destructive" });
    } finally {
      setIsCapturing(false);
    }
  }, [toast]);

  const captureAndShare = useCallback(async (title?: string, text?: string) => {
    if (!cardRef.current) return;
    setIsCapturing(true);
    try {
      const blob = await captureCardAsBlob(cardRef.current);
      await shareCardImage(
        blob,
        title ?? "WeightCut Wizard",
        text ?? "Check out my stats on WeightCut Wizard"
      );
    } catch (e) {
      console.error("Share failed:", e);
      toast({ title: "Failed to share image", variant: "destructive" });
    } finally {
      setIsCapturing(false);
    }
  }, [toast]);

  return { cardRef, isCapturing, captureAndDownload, captureAndShare };
}
