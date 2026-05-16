/**
 * Synchronously invokes the device camera and returns a base64 JPEG.
 *
 * Why this lives here and not in `useAIMealAnalysis`: iOS WKWebView requires
 * the call to `Camera.getPhoto({ source: Camera })` to descend from a real
 * user-gesture frame. Any `setTimeout` deferral or post-navigation effect
 * loses the activation token and the plugin silently no-ops — which is
 * exactly what happened with the previous "navigate then auto-trigger"
 * implementation of QuickLog → Food.
 *
 * Callers MUST invoke this from inside a click/tap handler. The function
 * itself is `async` (we `await` the lazy plugin import) but the gesture
 * token survives one synchronous turn into Camera.getPhoto, which is the
 * canonical Capacitor pattern.
 *
 * The web fallback uses `<input type="file" capture="environment">` — same
 * gesture-from-click contract, just hands off to the OS file picker.
 */
import { Capacitor } from "@capacitor/core";
import { logger } from "@/lib/logger";

export interface CapturePhotoResult {
  base64: string | null;
  /** Best-effort reason when no photo came back. `null` = success. */
  reason: "cancelled" | "denied" | "unavailable" | "error" | null;
}

export async function capturePhotoBase64(): Promise<CapturePhotoResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Camera, CameraResultType, CameraSource, CameraDirection } = await import("@capacitor/camera");

      const perms = await Camera.checkPermissions();
      if (perms.camera !== "granted") {
        const req = await Camera.requestPermissions({ permissions: ["camera"] });
        if (req.camera === "denied") return { base64: null, reason: "denied" };
      }

      const photo = await Camera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        direction: CameraDirection.Rear,
        width: 1024,
        height: 1024,
        promptLabelHeader: "Snap your meal",
        promptLabelPhoto: "Take Photo",
      });

      return photo.base64String
        ? { base64: photo.base64String, reason: null }
        : { base64: null, reason: "cancelled" };
    }

    // Web fallback. The hidden file input still fires from within the
    // original click stack, so mobile Safari opens the camera directly;
    // desktop browsers show the file picker.
    return await new Promise<CapturePhotoResult>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve({ base64: null, reason: "cancelled" });
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1] ?? null;
          resolve({ base64, reason: base64 ? null : "error" });
        };
        reader.onerror = () => resolve({ base64: null, reason: "error" });
        reader.readAsDataURL(file);
      };
      // `cancel` fires when the user dismisses the picker without choosing
      // a file (supported in modern browsers). Older browsers will just
      // never resolve — acceptable degradation.
      input.oncancel = () => resolve({ base64: null, reason: "cancelled" });
      input.click();
    });
  } catch (err: any) {
    const msg = String(err?.message ?? err).toLowerCase();
    if (msg.includes("cancel") || msg.includes("dismissed") || msg.includes("denied")) {
      return { base64: null, reason: "cancelled" };
    }
    logger.warn("capturePhotoBase64 failed", { error: msg });
    return { base64: null, reason: "error" };
  }
}
