import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, X } from "lucide-react";
import Cropper from "react-easy-crop";
import { Area } from "react-easy-crop";

interface ProfilePictureUploadProps {
  currentAvatarUrl?: string;
  onUploadSuccess: (url: string) => void;
  size?: "sm" | "lg";
  showRemove?: boolean;
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", (error) => reject(error), { once: true });
    image.src = url;
  });

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("No 2d context");
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Canvas is empty"));
      }
    }, "image/jpeg");
  });
}

export function ProfilePictureUpload({ currentAvatarUrl, onUploadSuccess, size = "lg", showRemove = true }: ProfilePictureUploadProps) {
  const avatarClass = size === "sm" ? "h-10 w-10" : "h-20 w-20";
  const iconClass = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  const overlayIconClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const [isOpen, setIsOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      if (!file.type.startsWith("image/")) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please select an image file",
        });
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Please select an image under 5MB",
        });
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImageSrc(reader.result as string);
        setIsOpen(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      const fileName = `${user.id}/${Date.now()}.jpg`;

      // Delete old avatar if exists
      if (currentAvatarUrl) {
        const oldPath = currentAvatarUrl.split("/").slice(-2).join("/");
        await supabase.storage.from("avatars").remove([oldPath]);
      }

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, croppedBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      // Update profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: "Profile picture updated successfully",
      });

      onUploadSuccess(publicUrl);
      setIsOpen(false);
      setImageSrc(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (currentAvatarUrl) {
        const oldPath = currentAvatarUrl.split("/").slice(-2).join("/");
        await supabase.storage.from("avatars").remove([oldPath]);
      }

      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile picture removed",
      });

      onUploadSuccess("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to remove",
        description: error.message,
      });
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <label
          className={`relative ${avatarClass} cursor-pointer group shrink-0`}
          aria-label="Upload profile photo"
        >
          {currentAvatarUrl ? (
            <img
              src={currentAvatarUrl}
              alt="Profile"
              className={`${avatarClass} rounded-full object-cover`}
            />
          ) : (
            <div className={`${avatarClass} rounded-full bg-muted flex items-center justify-center`}>
              <Upload className={`${iconClass} text-muted-foreground`} />
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity flex items-center justify-center">
            <Upload className={`${overlayIconClass} text-white`} />
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="hidden"
          />
        </label>
        {showRemove && currentAvatarUrl && (
          <Button variant="destructive" size="icon" onClick={handleRemove} aria-label="Remove photo">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[10003] bg-black/80 animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed left-1/2 top-[env(safe-area-inset-top,1rem)] z-[10004] -translate-x-1/2 w-[calc(100vw-2rem)] sm:max-w-lg sm:top-1/2 sm:-translate-y-1/2 max-h-[calc(100vh-2rem)] overflow-y-auto border bg-background p-4 sm:p-6 shadow-lg rounded-2xl space-y-3 sm:space-y-4 mt-2 sm:mt-0">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-semibold">Crop Profile Picture</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-sm opacity-70 hover:opacity-100 transition-opacity min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative h-[55vw] max-h-64 sm:max-h-80 w-full">
              {imageSrc && (
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Zoom</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}