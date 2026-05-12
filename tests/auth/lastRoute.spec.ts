/**
 * Regression tests for the lastRoute role-allowlist validation.
 *
 * Source under test: `isRouteCompatibleWithRole` exported from
 * src/lib/roleRouter.ts (Agent B). The same allowlist is also used inline by
 * `src/pages/Index.tsx` when restoring the user's last route after auth.
 *
 * NOTE — as of writing, `Index.tsx` still uses its OLD inline check
 * (`!lastRoute.startsWith("/coach")`) for coach safety only. If/when that gets
 * migrated to `isRouteCompatibleWithRole`, these tests guard the new behaviour.
 * See header note in tests/auth/roleRouter.spec.ts for the full contract.
 *
 * Bug class being prevented:
 *   1. A coach with a stale `lastRoute=/dashboard` getting bounced into a
 *      fighter-only page on cold start.
 *   2. A javascript: / data: URI sneaking through the lastRoute restore as a
 *      tiny XSS-via-router vector.
 */

import { describe, it, expect } from "vitest";
import { isRouteCompatibleWithRole } from "@/lib/roleRouter";

describe("isRouteCompatibleWithRole — fighter routes", () => {
  it.each([
    "/dashboard",
    "/nutrition",
    "/weight",
    "/training",
    "/fight-camps",
    "/wizard",
    "/onboarding",
  ])("%s is compatible with fighter", (path) => {
    expect(isRouteCompatibleWithRole(path, "fighter")).toBe(true);
  });

  it.each([
    "/dashboard",
    "/nutrition",
    "/weight",
  ])("%s is NOT compatible with coach", (path) => {
    expect(isRouteCompatibleWithRole(path, "coach")).toBe(false);
  });
});

describe("isRouteCompatibleWithRole — coach routes", () => {
  it.each(["/coach", "/coach/team", "/coach/athlete/123"])(
    "%s is compatible with coach",
    (path) => {
      expect(isRouteCompatibleWithRole(path, "coach")).toBe(true);
    },
  );

  it.each(["/coach", "/coach/team"])(
    "%s is NOT compatible with fighter (cross-role bounce guard)",
    (path) => {
      expect(isRouteCompatibleWithRole(path, "fighter")).toBe(false);
    },
  );
});

describe("isRouteCompatibleWithRole — role-neutral routes", () => {
  it.each([
    "/join",
    "/join/abc",
    "/join?code=XYZ",
    "/legal",
    "/legal?tab=privacy",
    "/share/foo",
    "/share/coach-invite/123",
  ])("%s is compatible with both roles", (path) => {
    expect(isRouteCompatibleWithRole(path, "fighter")).toBe(true);
    expect(isRouteCompatibleWithRole(path, "coach")).toBe(true);
  });
});

describe("isRouteCompatibleWithRole — defensive against bad input", () => {
  it("empty string → not compatible (fall back to home)", () => {
    expect(isRouteCompatibleWithRole("", "fighter")).toBe(false);
    expect(isRouteCompatibleWithRole("", "coach")).toBe(false);
  });

  // The helper is typed `string`, but at the JS boundary callers may pass
  // localStorage.getItem(...) which is `string | null`. Coerce defensively.
  it("nullish-ish values (string 'null', 'undefined') → not compatible", () => {
    expect(isRouteCompatibleWithRole("null", "fighter")).toBe(false);
    expect(isRouteCompatibleWithRole("undefined", "coach")).toBe(false);
  });

  it("javascript: pseudo-URL → not compatible (XSS guard)", () => {
    // The router will refuse to navigate to non-/ paths anyway, but the helper
    // must independently reject these to prevent a "compatible" lookup from
    // bleeding into other guards down the line.
    expect(isRouteCompatibleWithRole("javascript:alert(1)", "fighter")).toBe(false);
    expect(isRouteCompatibleWithRole("javascript:alert(1)", "coach")).toBe(false);
  });

  it("data: URL → not compatible", () => {
    expect(isRouteCompatibleWithRole("data:text/html,<script>", "fighter")).toBe(false);
  });

  it("protocol-relative //evil.com → not compatible (open-redirect guard)", () => {
    // "//evil.com" starts with `/` per JS but is an open-redirect target.
    // Both roles must reject it.
    expect(isRouteCompatibleWithRole("//evil.com/x", "coach")).toBe(false);
    expect(isRouteCompatibleWithRole("//evil.com/x", "fighter")).toBe(false);
  });

  it("path without leading slash → not compatible", () => {
    expect(isRouteCompatibleWithRole("dashboard", "fighter")).toBe(false);
  });
});

describe("isRouteCompatibleWithRole — query strings and hashes", () => {
  it("query string on a fighter route is preserved as compatible", () => {
    expect(isRouteCompatibleWithRole("/weight?date=2026-05-12", "fighter")).toBe(true);
  });

  it("hash on a coach route is preserved as compatible", () => {
    expect(isRouteCompatibleWithRole("/coach/team#members", "coach")).toBe(true);
  });
});
