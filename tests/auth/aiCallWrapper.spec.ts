/**
 * Tests for the `callWithGemRecovery` AI-call self-heal wrapper.
 *
 * The wrapper exists to recover from the specific failure mode where a paying
 * premium user's Convex `profile.subscriptionTier` is stale (webhook lag,
 * expired optimistic grant, cross-`users._id` drift on a fresh deployment).
 * The server-side gate throws `INSUFFICIENT_GEMS`; the wrapper reads RC's
 * CustomerInfo, calls `activatePremium`, and retries the original action.
 *
 * These tests pin the behaviour we depend on:
 *   - Happy path is a pass-through (no extra work for already-premium users).
 *   - Non-gem errors propagate untouched.
 *   - Gem errors trigger RC re-check; if RC says premium → activatePremium +
 *     onRecovered fire, then retry. If RC says not-premium → original error
 *     re-throws (paywall path).
 *   - The retry runs at most once (no infinite loop).
 *   - On non-native platforms (web) the wrapper short-circuits because the
 *     RC SDK isn't loaded.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Module-level hoisted mocks. `vi.hoisted` keeps mock state addressable from
// the test body without breaking `vi.mock`'s top-of-file hoist semantics.
const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  getCustomerInfo: vi.fn(),
  isPremiumFromCustomerInfo: vi.fn(),
  getSubscriptionFromCustomerInfo: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));
vi.mock("@/lib/purchases", () => ({
  getCustomerInfo: mocks.getCustomerInfo,
  isPremiumFromCustomerInfo: mocks.isPremiumFromCustomerInfo,
  getSubscriptionFromCustomerInfo: mocks.getSubscriptionFromCustomerInfo,
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { callWithGemRecovery } from "@/lib/aiCallWrapper";

const PREMIUM_INFO = { entitlements: { active: { pro: {} } } };
const PREMIUM_SUB = { tier: "premium_monthly" as const, expiresAt: "2099-01-01T00:00:00Z" };

beforeEach(() => {
  mocks.isNativePlatform.mockReset().mockReturnValue(true);
  mocks.getCustomerInfo.mockReset();
  mocks.isPremiumFromCustomerInfo.mockReset();
  mocks.getSubscriptionFromCustomerInfo.mockReset();
});

describe("callWithGemRecovery", () => {
  it("passes through on the happy path with no extra calls", async () => {
    const fn = vi.fn(async (args: { x: number }) => ({ ok: args.x }));
    const activatePremium = vi.fn();
    const out = await callWithGemRecovery(fn, { x: 7 }, { activatePremium });
    expect(out).toEqual({ ok: 7 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(activatePremium).not.toHaveBeenCalled();
    expect(mocks.getCustomerInfo).not.toHaveBeenCalled();
  });

  it("propagates non-gem errors without touching RC", async () => {
    const err = new Error("Network timeout");
    const fn = vi.fn(async () => { throw err; });
    const activatePremium = vi.fn();
    await expect(callWithGemRecovery(fn, {}, { activatePremium })).rejects.toBe(err);
    expect(activatePremium).not.toHaveBeenCalled();
    expect(mocks.getCustomerInfo).not.toHaveBeenCalled();
  });

  it("self-heals when RC confirms premium: re-sync, refresh, retry once, return success", async () => {
    let calls = 0;
    const fn = vi.fn(async (args: { x: number }) => {
      calls += 1;
      if (calls === 1) throw new Error("INSUFFICIENT_GEMS");
      return { ok: args.x };
    });
    const activatePremium = vi.fn(async () => ({ tier: "premium_monthly" }));
    const onRecovered = vi.fn();
    mocks.getCustomerInfo.mockResolvedValueOnce(PREMIUM_INFO);
    mocks.isPremiumFromCustomerInfo.mockReturnValueOnce(true);
    mocks.getSubscriptionFromCustomerInfo.mockReturnValueOnce(PREMIUM_SUB);

    const out = await callWithGemRecovery(fn, { x: 42 }, { activatePremium }, { onRecovered });

    expect(out).toEqual({ ok: 42 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(activatePremium).toHaveBeenCalledTimes(1);
    // The verified-purchase action takes no client-trusted args — it
    // derives userId from auth and verifies entitlement against the
    // RevenueCat REST API server-side. Anything the test mock used to
    // pass (tier/expiresAt) is now ignored by design.
    expect(activatePremium).toHaveBeenCalledWith();
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it("re-throws original error when RC also says not-premium", async () => {
    const err = new Error("INSUFFICIENT_GEMS");
    const fn = vi.fn(async () => { throw err; });
    const activatePremium = vi.fn();
    mocks.getCustomerInfo.mockResolvedValueOnce({ entitlements: { active: {} } });
    mocks.isPremiumFromCustomerInfo.mockReturnValueOnce(false);

    await expect(callWithGemRecovery(fn, {}, { activatePremium })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(activatePremium).not.toHaveBeenCalled();
  });

  it("re-throws original error if getCustomerInfo returns null", async () => {
    const err = new Error("INSUFFICIENT_GEMS");
    const fn = vi.fn(async () => { throw err; });
    const activatePremium = vi.fn();
    mocks.getCustomerInfo.mockResolvedValueOnce(null);

    await expect(callWithGemRecovery(fn, {}, { activatePremium })).rejects.toBe(err);
    expect(activatePremium).not.toHaveBeenCalled();
  });

  it("retries at most once — propagates the second INSUFFICIENT_GEMS without infinite loop", async () => {
    const err = new Error("INSUFFICIENT_GEMS");
    const fn = vi.fn(async () => { throw err; });
    const activatePremium = vi.fn(async () => ({}));
    mocks.getCustomerInfo.mockResolvedValueOnce(PREMIUM_INFO);
    mocks.isPremiumFromCustomerInfo.mockReturnValueOnce(true);
    mocks.getSubscriptionFromCustomerInfo.mockReturnValueOnce(PREMIUM_SUB);

    await expect(callWithGemRecovery(fn, {}, { activatePremium })).rejects.toBe(err);
    // First attempt + one retry = exactly two calls.
    expect(fn).toHaveBeenCalledTimes(2);
    expect(activatePremium).toHaveBeenCalledTimes(1);
  });

  it("still retries when activatePremium itself throws (server might recover via another path)", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("INSUFFICIENT_GEMS");
      return "ok";
    });
    const activatePremium = vi.fn(async () => { throw new Error("transient activate failure"); });
    mocks.getCustomerInfo.mockResolvedValueOnce(PREMIUM_INFO);
    mocks.isPremiumFromCustomerInfo.mockReturnValueOnce(true);
    mocks.getSubscriptionFromCustomerInfo.mockReturnValueOnce(PREMIUM_SUB);

    const out = await callWithGemRecovery(fn, {}, { activatePremium });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("short-circuits on web (non-native) and propagates the original error", async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    const err = new Error("INSUFFICIENT_GEMS");
    const fn = vi.fn(async () => { throw err; });
    const activatePremium = vi.fn();

    await expect(callWithGemRecovery(fn, {}, { activatePremium })).rejects.toBe(err);
    expect(mocks.getCustomerInfo).not.toHaveBeenCalled();
    expect(activatePremium).not.toHaveBeenCalled();
  });
});
