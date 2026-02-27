import { ReactNode, useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, Loader2 } from "lucide-react";
import { useShareCard } from "@/hooks/useShareCard";
import type { AspectRatio } from "./templates/CardShell";

interface ShareCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  shareTitle?: string;
  shareText?: string;
  children: (props: {
    cardRef: React.RefObject<HTMLDivElement>;
    aspect: AspectRatio;
  }) => ReactNode;
}

// Card source dimensions
const CARD_W = 1080;
const CARD_H: Record<AspectRatio, number> = { square: 1080, story: 1920 };

// Max preview height (px) — keeps buttons always visible
const MAX_PREVIEW_H = 340;

export function ShareCardDialog({
  open,
  onOpenChange,
  title = "Share Card",
  shareTitle,
  shareText,
  children,
}: ShareCardDialogProps) {
  const [aspect, setAspect] = useState<AspectRatio>("square");
  const { cardRef, isCapturing, captureAndDownload, captureAndShare } = useShareCard();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 300, h: MAX_PREVIEW_H, scale: 0.28 });

  const recalc = useCallback(() => {
    if (!wrapperRef.current) return;
    const containerW = wrapperRef.current.clientWidth;
    const cardH = CARD_H[aspect];

    // Scale to fit width
    const scaleByW = containerW / CARD_W;
    // Scale to fit max height
    const scaleByH = MAX_PREVIEW_H / cardH;
    // Use whichever is smaller so both axes fit
    const scale = Math.min(scaleByW, scaleByH);

    setDims({
      w: Math.round(CARD_W * scale),
      h: Math.round(cardH * scale),
      scale,
    });
  }, [aspect]);

  useEffect(() => {
    if (!open) return;
    // Small delay to let dialog render and get layout width
    const t = setTimeout(recalc, 20);
    return () => clearTimeout(t);
  }, [aspect, open, recalc]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm w-[calc(100vw-32px)] rounded-3xl flex flex-col gap-3 p-4 max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
        </DialogHeader>

        {/* Aspect ratio toggle */}
        <div className="flex gap-2 justify-center shrink-0">
          {(["square", "story"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAspect(a)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                aspect === a
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-accent/40 text-foreground/70 hover:bg-accent/60"
              }`}
            >
              {a === "square" ? "Square 1:1" : "Story 9:16"}
            </button>
          ))}
        </div>

        {/* Preview — fixed max height, no gaps */}
        <div ref={wrapperRef} className="w-full shrink-0 flex justify-center">
          <div
            className="overflow-hidden rounded-2xl border border-border/50 bg-black"
            style={{ width: dims.w, height: dims.h }}
          >
            <div
              style={{
                transform: `scale(${dims.scale})`,
                transformOrigin: "top left",
                width: CARD_W,
                height: CARD_H[aspect],
              }}
            >
              {children({ cardRef, aspect })}
            </div>
          </div>
        </div>

        {/* Action buttons — always visible */}
        <div className="flex gap-3 shrink-0">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-2xl text-sm font-bold"
            onClick={() => captureAndDownload()}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download
          </Button>
          <Button
            className="flex-1 h-12 rounded-2xl text-sm font-bold"
            onClick={() => captureAndShare(shareTitle, shareText)}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Share2 className="h-4 w-4 mr-2" />
            )}
            Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
