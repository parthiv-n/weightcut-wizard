import { useRef, useState } from "react";
import { Upload, Loader2, X, ImagePlus } from "lucide-react";
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
 * Tap the avatar → file picker → resize to 256×256 webp → upload to
 * gym-logos/{gymId}/logo.webp → update gyms.logo_url. Uses native file
 * picker (works in Capacitor WebView via FileReader).
 */
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
  const { toast } = useToast();

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

      const blob = await resizeImageToSquareWebp(dataUrl, 256, 0.85);
      const path = `${gymId}/logo.webp`;

      const { error: upErr } = await supabase.storage
        .from("gym-logos")
        .upload(path, blob, {
          contentType: "image/webp",
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
      toast({ title: "Logo updated" });
    } catch (err: any) {
      logger.error("GymLogoUpload: upload failed", err);
      toast({ title: "Could not upload logo", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (uploading || !currentLogoUrl) return;
    setUploading(true);
    triggerHaptic(ImpactStyle.Medium);
    try {
      await supabase.storage.from("gym-logos").remove([`${gymId}/logo.webp`]);
      const { error } = await supabase
        .from("gyms")
        .update({ logo_url: null })
        .eq("id", gymId);
      if (error) throw error;
      onUploaded(null);
      toast({ title: "Logo removed" });
    } catch (err: any) {
      logger.error("GymLogoUpload: remove failed", err);
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
        className="relative group flex-shrink-0"
        aria-label={hasLogo ? "Change gym logo" : "Upload gym logo"}
      >
        {hasLogo ? (
          <>
            <GymLogoAvatar logoUrl={currentLogoUrl} name={gymName} size={size} />
            {/* Subtle camera badge — always visible so users know it's editable */}
            <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center shadow-sm">
              {uploading ? (
                <Loader2 className="h-2.5 w-2.5 text-foreground animate-spin" />
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
            className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center text-primary active:bg-primary/10 transition-colors"
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
