import { Capacitor } from "@capacitor/core";
import { InAppReview } from "@capacitor-community/in-app-review";
import { logger } from "@/lib/logger";

const REVIEW_KEY = "wcw_review_prompted";
const MIN_DAYS_BEFORE_PROMPT = 7;
const INSTALL_DATE_KEY = "wcw_install_date";

export function trackInstallDate(): void {
  if (!localStorage.getItem(INSTALL_DATE_KEY)) {
    localStorage.setItem(INSTALL_DATE_KEY, new Date().toISOString());
  }
}

export async function maybeRequestReview(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (localStorage.getItem(REVIEW_KEY)) return;

  const installDate = localStorage.getItem(INSTALL_DATE_KEY);
  if (!installDate) return;

  const daysSinceInstall = Math.floor(
    (Date.now() - new Date(installDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceInstall < MIN_DAYS_BEFORE_PROMPT) return;

  try {
    await InAppReview.requestReview();
    localStorage.setItem(REVIEW_KEY, new Date().toISOString());
  } catch (err) {
    logger.warn("In-app review request failed", { error: err });
  }
}
