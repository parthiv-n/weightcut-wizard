import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

const BUCKET = "training-media";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function getExtFromFile(file: File): string {
  const name = file.name;
  const dot = name.lastIndexOf(".");
  if (dot !== -1) return name.slice(dot + 1).toLowerCase();
  // fallback from mime
  const sub = file.type?.split("/")[1];
  if (sub === "jpeg") return "jpg";
  return sub || "jpg";
}

function extractStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

export async function uploadSessionMedia(
  userId: string,
  sessionId: string,
  file: File,
  existingMediaUrl?: string | null,
): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File is too large. Maximum size is 50MB.");
  }

  // Delete old media if replacing
  if (existingMediaUrl) {
    const oldPath = extractStoragePath(existingMediaUrl);
    if (oldPath) {
      await supabase.storage.from(BUCKET).remove([oldPath]).catch((e) => {
        logger.error("Failed to delete old session media", e);
      });
    }
  }

  const ext = getExtFromFile(file);
  const fileName = `${userId}/session-${sessionId}-${Date.now()}.${ext}`;
  const contentType = file.type || "image/jpeg";

  logger.info(`Uploading session media: bucket=${BUCKET}, path=${fileName}, size=${file.size}, type=${contentType}`);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, file, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    logger.error("Storage upload failed", { bucket: BUCKET, path: fileName, error: uploadError });
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(fileName);

  return publicUrl;
}

export async function deleteSessionMedia(mediaUrl: string): Promise<void> {
  const path = extractStoragePath(mediaUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    logger.error("Failed to delete session media", error);
  }
}
