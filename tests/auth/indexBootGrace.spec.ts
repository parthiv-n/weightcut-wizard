import { describe, it, expect } from "vitest";

// Regression guard for src/pages/Index.tsx splash-screen flicker fix.
// The predicate below mirrors the splash-hold guard added in Index.tsx:
//   if (isLoading || userId || !bootGraceExpired) return <WizardLoader />;
// During the BOOT_GRACE_MS=1200 window we hold the splash so the landing
// CTA never flashes for a frame on cold start before redirect.
const showSplash = (
  isLoading: boolean,
  userId: string | null,
  bootGraceExpired: boolean,
): boolean => isLoading || !!userId || !bootGraceExpired;

describe("Index splash-hold predicate (boot grace)", () => {
  it("cold start: shows splash while auth is loading regardless of grace", () => {
    expect(showSplash(true, null, false)).toBe(true);
    expect(showSplash(true, null, true)).toBe(true);
    expect(showSplash(true, "user-abc", false)).toBe(true);
  });

  it("mid-boot: holds splash when auth settled to no-session but grace not expired (bug fix)", () => {
    expect(showSplash(false, null, false)).toBe(true);
  });

  it("authenticated: shows splash while redirect to /dashboard is pending", () => {
    expect(showSplash(false, "user-abc", true)).toBe(true);
    expect(showSplash(false, "user-abc", false)).toBe(true);
  });

  it("unauthenticated after grace: releases splash so landing CTA can render", () => {
    expect(showSplash(false, null, true)).toBe(false);
  });
});
