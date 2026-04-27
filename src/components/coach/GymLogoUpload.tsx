import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, X, ImagePlus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { resizeImageToSquareWebp } from "@/lib/imageResize";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { logger } from "@/lib/logger";
import { GymLogoAvatar } from "./GymLogoAvatar";

interface Props {
  gymId: string;
  gymName: string;
  currentLogoUrl: string | null;
  size?: number;
  onUploaded: (newUrl: string | null) => void;
  /** When true, hide the remove button (used in compact contexts) */
  hideRemove?: boolean;
}

/**
 * Tap the avatar → file picker → resize to 256×256 webp (or jpeg fallback) →
 * upload to gym-logos/{gymId}/logo.{ext} → update gyms.logo_url. Uses native
 * file picker (works in Capacitor WebView via FileReader).
 *
 * iOS WebKit notes:
 *  - `canvas.toBlob('image/webp', ...)` is buggy on iOS 14.0–14.4 and may
 *    silently produce a null/empty blob. The resizer falls back to jpeg.
 *  - Supabase storage uploads use `fetch()` under the hood; an empty body
 *    surfaces as `TypeError: Load failed` in WebKit. We surface friendlier
 *    errors and log blob.size/blob.type to make future debugging easier.
 */
const KNOWN_LOGO_EXTS = ["webp", "jpg", "jpeg", "png"] as const;

export function GymLogoUpload({
  gymId,
  gymName,
  currentLogoUrl,
  size = 56,
  onUploaded,
  hideRemove = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const [pulseHint, setPulseHint] = useState<boolean>(currentLogoUrl == null);
  const { toast } = useToast();

  // Auto-disable the discoverability pulse after 3s on first render
  useEffect(() => {
    if (!pulseHint) return;
    const t = window.setTimeout(() => setPulseHint(false), 3000);
    return () => window.clearTimeout(t);
  }, [pulseHint]);

  const triggerPicker = () => {
    if (uploading) return;
    triggerHaptic(ImpactStyle.Light);
    inputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting same file later

    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Keep it under 5MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("File read failed"));
        reader.readAsDataURL(file);
      });

      const { blob, mime, ext } = await resizeImageToSquareWebp(dataUrl, 256, 0.85);
      logger.info("GymLogoUpload: encoded image", {
        gymId,
        size: blob.size,
        type: blob.type || mime,
        ext,
      });

      if (!blob.size) {
        throw new Error("Encoded image is empty — please try a different photo.");
      }

      // Best-effort cleanup of any previously uploaded variants under this gym.
      // If the user previously uploaded `logo.webp` and now produces `logo.jpg`,
      // the old file would otherwise linger forever (gyms.logo_url points to
      // the new path, but the orphan eats storage). Errors here are ignored.
      try {
        await supabase.storage
          .from("gym-logos")
          .remove(KNOWN_LOGO_EXTS.map((e) => `${gymId}/logo.${e}`));
      } catch {
        /* best-effort */
      }

      const path = `${gymId}/logo.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("gym-logos")
        .upload(path, blob, {
          contentType: mime,
          upsert: true,
          cacheControl: "86400",
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("gym-logos").getPublicUrl(path);
      // Cache-bust so the freshly uploaded image shows immediately
      const versioned = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: updErr } = await supabase
        .from("gyms")
        .update({ logo_url: versioned })
        .eq("id", gymId);
      if (updErr) throw updErr;

      onUploaded(versioned);
      setStatus("success");
      window.setTimeout(() => setStatus("idle"), 1000);
      toast({ title: "Logo updated" });
    } catch (err: unknown) {
      logger.error("GymLogoUpload: upload failed", err, { gymId });
      handleUploadError(err);
    } finally {
      setUploading(false);
    }
  };

  // Translate the various error shapes Supabase + WebKit throw into a
  // toast the user can actually act on.
  const handleUploadError = (err: unknown) => {
    const e = (err ?? {}) as {
      message?: string;
      error?: string;
      statusCode?: number | string;
      name?: string;
    };
    const raw =
      (typeof e.error === "string" && e.error) ||
      e.message ||
      "Unknown error";

    // Bucket-not-deployed case (storage 404)
    if (/bucket not found/i.test(raw)) {
      toast({
        title: "Setup incomplete",
        description: "Storage bucket missing. Contact support.",
        variant: "destructive",
      });
      return;
    }

    // RLS denial — usually means the user isn't the gym owner
    if (/row-level security|new row violates/i.test(raw)) {
      toast({
        title: "Permission denied",
        description: "Only the gym owner can change the logo.",
        variant: "destructive",
      });
      return;
    }

    // iOS WebKit network error
    if (e.name === "TypeError" && /load failed/i.test(raw)) {
      toast({
        title: "Could not upload logo",
        description: "Network error — check your connection and try again.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Could not upload logo",
      description: raw,
      variant: "destructive",
    });
  };

  const handleRemove = async () => {
    if (uploading || !currentLogoUrl) return;
    setUploading(true);
    triggerHaptic(ImpactStyle.Medium);
    try {
      // Remove every possible variant — we don't know which extension was used.
      await supabase.storage
        .from("gym-logos")
        .remove(KNOWN_LOGO_EXTS.map((e) => `${gymId}/logo.${e}`));
      const { error } = await supabase
        .from("gyms")
        .update({ logo_url: null })
        .eq("id", gymId);
      if (error) throw error;
      onUploaded(null);
      toast({ title: "Logo removed" });
    } catch (err: unknown) {
      logger.error("GymLogoUpload: remove failed", err, { gymId });
      toast({ title: "Could not remove logo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const hasLogo = !!currentLogoUrl;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={triggerPicker}
        disabled={uploading}
        className={`relative group flex-shrink-0 transition-opacity ${
          uploading ? "opacity-60" : "opacity-100"
        }`}
        aria-label={hasLogo ? "Change gym logo" : "Upload gym logo"}
      >
        {hasLogo ? (
          <>
            <GymLogoAvatar logoUrl={currentLogoUrl} name={gymName} size={size} />
            {/* Status badge — camera by default, spinner while uploading,
                checkmark briefly on success */}
            <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center shadow-sm">
              {uploading ? (
                <Loader2 className="h-2.5 w-2.5 text-foreground animate-spin" />
              ) : status === "success" ? (
                <Check className="h-2.5 w-2.5 text-emerald-500" />
              ) : (
                <Upload className="h-2.5 w-2.5 text-foreground" />
              )}
            </span>
          </>
        ) : (
          // No logo yet — render a more inviting "tap to add logo" state
          // with a dashed border + visible icon so users discover it.
          <div
            style={{ width: size, height: size }}
            className={`rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center text-primary active:bg-primary/10 transition-colors ${
              pulseHint ? "animate-pulse" : ""
            }`}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-4 w-4" />
                {size >= 56 && (
                  <span className="text-[8px] font-semibold uppercase tracking-wider mt-0.5">
                    Logo
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </button>
      {hasLogo && !hideRemove && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={uploading}
          className="h-8 w-8 rounded-full bg-muted/50 active:bg-destructive/20 transition-colors flex items-center justify-center text-muted-foreground active:text-destructive"
          aria-label="Remove logo"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
