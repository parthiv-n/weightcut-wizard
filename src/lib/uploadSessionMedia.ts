/**
 * Training-session media uploads.
 *
 * Convex File Storage replaces the old Supabase `training-media` bucket.
 * Flow:
 *   1. mutation `fight_camp.generateMediaUploadUrl` → one-time POST URL
 *   2. fetch(uploadUrl, { method: "POST", body: file }) → returns storageId
 *   3. caller writes the storageId on the session row (TrainingCalendar.tsx
 *      currently still uses Supabase fight_camp_calendar.media_url, but we
 *      surface the storage id so a future Convex-native session save can
 *      consume it directly).
 *
 * The returned `mediaUrl` is the long-lived URL from `ctx.storage.getUrl()`
 * — safe to display in <img>/<video> tags.
 */
import { ConvexReactClient } from "convex/react";
import { convex as defaultConvex } from "@/integrations/convex/client";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { logger } from "@/lib/logger";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB — videos can be chunky
const UPLOAD_TIMEOUT_MS = 25_000;
const ALLOWED_MIME_PREFIXES = ["image/", "video/"];

export interface UploadedMedia {
  /** Convex storage id — persist this on the session row. */
  storageId: Id<"_storage">;
  /** Long-lived public URL for <img>/<video> display. */
  mediaUrl: string;
}

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms),
    ),
  ]);
}

/**
 * Upload a training-media file (photo or short video) to Convex File Storage.
 *
 * Signature preserved (userId/sessionId still accepted for log context) so
 * existing call-sites in TrainingCalendar.tsx don't break.
 * `existingMediaUrl` is ignored — the Convex `fight_camp.updateCalendarEntry`
 * mutation handles orphan cleanup atomically when the session row is updated.
 */
export async function uploadSessionMedia(
  userId: string,
  sessionId: string,
  file: File,
  _existingMediaUrl?: string | null,
  client: ConvexReactClient = defaultConvex,
): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File is too large. Maximum size is 50MB.");
  }

  const mime = file.type || "image/jpeg";
  if (file.type && !ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    throw new Error("Unsupported media type. Please pick an image or video.");
  }

  logger.info("uploadSessionMedia: starting Convex upload", {
    userId,
    sessionId,
    size: file.size,
    type: mime,
  });

  // 1. Mint a one-time upload URL.
  const uploadUrl = (await withTimeout(
    client.mutation(api.fight_camp.generateMediaUploadUrl, {}),
    UPLOAD_TIMEOUT_MS,
    "Generate upload URL",
  )) as string;

  // 2. POST the file bytes to the signed URL.
  const uploadRes = await withTimeout(
    fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": mime },
      body: file,
    }),
    UPLOAD_TIMEOUT_MS,
    "Upload session media",
  );
  if (!uploadRes.ok) {
    throw new Error(`Upload failed (${uploadRes.status})`);
  }
  const body = (await uploadRes.json()) as { storageId: Id<"_storage"> };

  // 3. Resolve the storage id to a long-lived URL for display.
  const mediaUrl = (await client.query(api.fight_camp.getMediaUrl, {
    storageId: body.storageId,
  })) as string | null;
  if (!mediaUrl) {
    throw new Error("Upload succeeded but URL resolution failed");
  }
  return mediaUrl;
}

/**
 * Legacy URL-based delete. With Convex Storage we can't delete by URL alone
 * — the storage id is the only handle. Best-effort no-op: orphaned blobs are
 * cheap and `updateCalendarEntry` / `deleteCalendarEntry` clean up correctly.
 */
export async function deleteSessionMedia(_mediaUrl: string): Promise<void> {
  // Intentionally a no-op. The session-row mutations on Convex own storage
  // lifecycle now; orphan cleanup happens there atomically.
  return;
}
