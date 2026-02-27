import { toBlob } from "html-to-image";
import { Capacitor } from "@capacitor/core";

export async function captureCardAsBlob(
  element: HTMLElement,
  options?: { pixelRatio?: number }
): Promise<Blob> {
  const blob = await toBlob(element, {
    pixelRatio: options?.pixelRatio ?? 2,
    cacheBust: true,
    // Inline styles for reliable capture
    skipAutoScale: true,
    backgroundColor: "#080808",
  });
  if (!blob) throw new Error("Failed to capture card image");
  return blob;
}

export function downloadCardImage(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function shareCardImage(
  blob: Blob,
  title: string,
  text: string
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      // Convert blob to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const fileName = `weightcut-wizard-${Date.now()}.png`;
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });

      await Share.share({
        title,
        text,
        url: result.uri,
      });
      return;
    } catch (e) {
      console.warn("Native share failed, falling back:", e);
    }
  }

  // Web Share API
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], "weightcut-wizard.png", { type: "image/png" });
    const shareData = { title, text, files: [file] };
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        // User cancelled or error — fall through to download
        if ((e as DOMException).name === "AbortError") return;
      }
    }
  }

  // Fallback: download
  downloadCardImage(blob, `weightcut-wizard-${Date.now()}.png`);
}
