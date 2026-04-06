import { Capacitor } from "@capacitor/core";
import { logger } from "@/lib/logger";

// RevenueCat modules — dynamically imported only on native
let Purchases: any = null;
let LOG_LEVEL: any = null;
let RevenueCatUI: any = null;

const RC_API_KEY_IOS = "appl_KEgVHMBYZuygdbadkzJDGNdIuTL";
const ENTITLEMENT_ID = "FightCamp Wizard Pro";

export const PRODUCT_IDS = {
  monthly: "com.weightcutwizard.premium.monthly",
  yearly: "com.weightcutwizard.premium.yearly",
} as const;

async function loadRC() {
  if (Purchases) return;
  if (!Capacitor.isNativePlatform()) return;
  try {
    const mod = await import("@revenuecat/purchases-capacitor");
    Purchases = mod.Purchases;
    LOG_LEVEL = mod.LOG_LEVEL;
  } catch (err) {
    logger.warn("RevenueCat plugin not available", { error: String(err) });
  }
}

async function loadRCUI() {
  if (RevenueCatUI) return;
  if (!Capacitor.isNativePlatform()) return;
  try {
    const mod = await import("@revenuecat/purchases-capacitor-ui");
    RevenueCatUI = mod.RevenueCatUI;
  } catch (err) {
    logger.warn("RevenueCat UI plugin not available", { error: String(err) });
  }
}

// ─── Initialization ───

export async function initializePurchases(userId: string): Promise<void> {
  await loadRC();
  if (!Purchases) return;

  try {
    await Purchases.configure({
      apiKey: RC_API_KEY_IOS,
      appUserID: userId,
    });
    // Enable debug logs in development
    if (import.meta.env.DEV) {
      await Purchases.setLogLevel({ level: LOG_LEVEL?.DEBUG ?? 4 });
    }
    logger.info("RevenueCat initialized", { userId });
  } catch (err) {
    logger.error("RevenueCat configure failed", err);
  }
}

// ─── Offerings & Packages ───

export async function getOfferings(): Promise<any | null> {
  await loadRC();
  if (!Purchases) return null;

  try {
    const offerings = await Purchases.getOfferings();
    return offerings?.current ?? null;
  } catch (err) {
    logger.error("Failed to get offerings", err);
    return null;
  }
}

// ─── Purchase ───

export interface PurchaseResult {
  customerInfo: any;
  cancelled: boolean;
}

export async function purchasePackage(packageToPurchase: any): Promise<PurchaseResult> {
  // Dev mock purchase for testing in browser
  if (!Capacitor.isNativePlatform() && import.meta.env.DEV) {
    return mockPurchase();
  }

  await loadRC();
  if (!Purchases) throw new Error("RevenueCat not available");

  try {
    const result = await Purchases.purchasePackage({ aPackage: packageToPurchase });
    const customerInfo = result?.customerInfo;

    // Check if entitlement is now active
    if (customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]) {
      logger.info("Purchase successful", {
        entitlement: ENTITLEMENT_ID,
        productId: customerInfo.entitlements.active[ENTITLEMENT_ID]?.productIdentifier,
      });
    }

    return { customerInfo, cancelled: false };
  } catch (error: any) {
    // RevenueCat error codes — PURCHASE_CANCELLED_ERROR = 1
    if (error?.code === 1 || error?.code === "PURCHASE_CANCELLED_ERROR") {
      logger.info("Purchase cancelled by user");
      return { customerInfo: null, cancelled: true };
    }
    // Re-throw other errors (network, billing, etc.)
    throw error;
  }
}

// ─── Mock Purchase (dev only) ───

async function mockPurchase(): Promise<PurchaseResult> {
  logger.info("[MOCK] Simulating purchase flow...");

  // Simulate StoreKit delay
  await new Promise((r) => setTimeout(r, 1500));

  // Build mock customer info with active entitlement
  const mockCustomerInfo = {
    entitlements: {
      active: {
        [ENTITLEMENT_ID]: {
          identifier: ENTITLEMENT_ID,
          isActive: true,
          productIdentifier: "monthly",
          willRenew: true,
          expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isSandbox: true,
        },
      },
      all: {},
    },
    activeSubscriptions: ["monthly"],
    firstSeen: new Date().toISOString(),
    originalAppUserId: "mock_user",
    managementURL: null,
  };

  logger.info("[MOCK] Purchase complete — entitlement active:", { entitlement: ENTITLEMENT_ID });
  return { customerInfo: mockCustomerInfo, cancelled: false };
}

// ─── Restore ───

export async function restorePurchases(): Promise<any | null> {
  await loadRC();
  if (!Purchases) return null;

  const result = await Purchases.restorePurchases();
  return result?.customerInfo ?? null;
}

// ─── Customer Info ───

export async function getCustomerInfo(): Promise<any | null> {
  await loadRC();
  if (!Purchases) return null;

  try {
    const result = await Purchases.getCustomerInfo();
    return result?.customerInfo ?? null;
  } catch {
    return null;
  }
}

export function isPremiumFromCustomerInfo(customerInfo: any): boolean {
  if (!customerInfo?.entitlements?.active) return false;
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

// ─── RevenueCat Native Paywall ───

/**
 * Present RevenueCat's native paywall UI.
 * This uses the paywall configured in the RevenueCat dashboard.
 * Returns the customer info after the paywall is dismissed.
 */
export async function presentPaywall(): Promise<{ customerInfo: any; paywallResult: string } | null> {
  await loadRC();
  await loadRCUI();
  if (!RevenueCatUI) return null;

  try {
    const result = await RevenueCatUI.presentPaywall();
    return {
      customerInfo: result?.customerInfo ?? null,
      paywallResult: result?.paywallResult ?? "NOT_PRESENTED",
    };
  } catch (err) {
    logger.error("Failed to present paywall", err);
    return null;
  }
}

/**
 * Present RevenueCat's native paywall UI if the user is not entitled.
 * Only shows if the user doesn't have the entitlement.
 */
export async function presentPaywallIfNeeded(): Promise<{ customerInfo: any; paywallResult: string } | null> {
  await loadRC();
  await loadRCUI();
  if (!RevenueCatUI) return null;

  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT_ID,
    });
    return {
      customerInfo: result?.customerInfo ?? null,
      paywallResult: result?.paywallResult ?? "NOT_PRESENTED",
    };
  } catch (err) {
    logger.error("Failed to present paywall", err);
    return null;
  }
}

// ─── Customer Center ───

/**
 * Present RevenueCat's Customer Center for subscription management.
 * Handles cancellation, plan changes, and support.
 */
export async function presentCustomerCenter(): Promise<void> {
  await loadRC();
  await loadRCUI();
  if (!RevenueCatUI) {
    // Fallback: open Apple subscription management
    window.open("https://apps.apple.com/account/subscriptions", "_blank");
    return;
  }

  try {
    await RevenueCatUI.presentCustomerCenter();
  } catch (err) {
    logger.error("Failed to present customer center", err);
    // Fallback
    window.open("https://apps.apple.com/account/subscriptions", "_blank");
  }
}

// ─── Manage Subscriptions (legacy fallback) ───

export async function showManageSubscriptions(): Promise<void> {
  await loadRC();
  if (!Purchases) {
    window.open("https://apps.apple.com/account/subscriptions", "_blank");
    return;
  }

  try {
    await Purchases.showManageSubscriptions();
  } catch {
    window.open("https://apps.apple.com/account/subscriptions", "_blank");
  }
}

// ─── Listener for real-time customer info changes ───

export async function addCustomerInfoUpdateListener(
  callback: (customerInfo: any) => void
): Promise<(() => void) | null> {
  await loadRC();
  if (!Purchases) return null;

  try {
    const listener = await Purchases.addCustomerInfoUpdateListener(
      (info: any) => callback(info.customerInfo)
    );
    return () => listener?.remove?.();
  } catch {
    return null;
  }
}
