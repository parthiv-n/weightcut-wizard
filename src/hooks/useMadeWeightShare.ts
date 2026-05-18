/**
 * useMadeWeightShare — wraps the Canvas card generator + Capacitor Share API.
 *
 * Behaviour:
 *   - On native: writes the JPEG to Cache via @capacitor/filesystem, then
 *     hands the file URI to @capacitor/share (IG/Stories/Messages/etc.).
 *   - On web: prefers `navigator.share({ files })` and falls back to a
 *     download anchor so the user always gets the artifact.
 *   - Haptic success notification on share resolve, error toast on failure.
 *   - User-cancel (AbortError) is treated as a no-op, NOT an error.
 *
 * Keeps a single in-flight generation at a time via the `generating` flag so
 * a double-tap on the share button doesn't burn two canvases.
 */
import { useCallback, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useToast } from "@/hooks/use-toast";
import { triggerHapticSuccess } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import {
  generateMadeWeightCard,
  type MadeWeightInput,
} from "@/lib/madeWeightCard";

const FILE_NAME_PREFIX = "made-weight";

function buildFileName(): string {
  return `${FILE_NAME_PREFIX}-${Date.now()}.jpg`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read blob as base64"));
        return;
      }
      // Strip the `data:<mime>;base64,` prefix.
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Try the native share pipeline (Capacitor). Returns `true` when the share
 * sheet was presented, regardless of whether the user picked a destination
 * or cancelled — both are user-initiated outcomes. Returns `false` when the
 * runtime isn't native or the plugins blew up (caller falls back to web).
 */
async function shareNative(blob: Blob, fileName: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const base64 = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: "Made Weight",
      text: "Made weight.",
      url: written.uri,
      dialogTitle: "Made Weight",
    });
    return true;
  } catch (err) {
    logger.warn("Native made-weight share failed, falling back", { error: err });
    return false;
  }
}

/**
 * Web Share API path. Returns `true` if the share sheet handled the file
 * (including user cancel), `false` if the API is unavailable or refused
 * the file payload — the caller then downloads.
 */
async function shareWeb(blob: Blob, fileName: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  try {
    const file = new File([blob], fileName, { type: "image/jpeg" });
    const shareData: ShareData = {
      title: "Made Weight",
      text: "Made weight.",
      files: [file],
    };
    if (navigator.canShare && !navigator.canShare(shareData)) return false;
    await navigator.share(shareData);
    return true;
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "AbortError") {
      // User dismissed the sheet — not an error.
      return true;
    }
    logger.warn("Web share failed, falling back to download", { error: err });
    return false;
  }
}

export function useMadeWeightShare() {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const shareCard = useCallback(
    async (input: MadeWeightInput): Promise<void> => {
      if (generating) return;
      setGenerating(true);
      try {
        const blob = await generateMadeWeightCard(input);
        const fileName = buildFileName();
        const sharedNatively = await shareNative(blob, fileName);
        if (!sharedNatively) {
          const sharedOnWeb = await shareWeb(blob, fileName);
          if (!sharedOnWeb) downloadBlob(blob, fileName);
        }
        // Soft success cue once the share sheet has resolved.
        triggerHapticSuccess();
      } catch (err) {
        logger.error("Made Weight share failed", { error: err });
        toast({
          title: "Couldn't share your card",
          description: "Try again, or save it from the preview.",
          variant: "destructive",
        });
      } finally {
        setGenerating(false);
      }
    },
    [generating, toast],
  );

  return { shareCard, generating };
}
