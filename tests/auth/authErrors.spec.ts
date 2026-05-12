/**
 * Regression tests for `mapAuthError` — the auth error mapper that converts
 * raw Convex Auth / network errors into friendly, security-aware UI strings.
 *
 * Source under test: src/lib/authErrors.ts (Agent A)
 *
 * Why these tests exist:
 *   - Convex Auth surfaces machine-shaped names like `InvalidAccountId` and
 *     `InvalidSecret` that are cryptic AND leak account-existence info.
 *   - The mapper MUST collapse `InvalidAccountId` and `InvalidSecret` to the
 *     same signIn message ("Incorrect email or password.") so an attacker can't
 *     enumerate emails by watching for different error strings.
 *   - The mapper MUST also gracefully degrade on null / string / wrapped errors
 *     because Convex sometimes wraps the real message in `.data.message`.
 *
 * Pattern follows tests/weight/weightAnalysisShape.spec.tsx (Vitest, node env,
 * direct import, no testing-library).
 */

import { describe, it, expect } from "vitest";
import { mapAuthError, isValidEmail, type AuthFlow } from "@/lib/authErrors";

// ---------------------------------------------------------------------------
// Convex Auth error names — friendly mapping per flow
// ---------------------------------------------------------------------------

describe("mapAuthError — Convex Auth raw error names", () => {
  it("InvalidAccountId on signIn → generic 'Incorrect email or password.'", () => {
    const err = new Error("InvalidAccountId");
    expect(mapAuthError(err, "signIn")).toBe("Incorrect email or password.");
  });

  it("InvalidSecret on signIn → SAME message as InvalidAccountId (no enumeration)", () => {
    // This is a security invariant — the two cases MUST map to the same string.
    const a = mapAuthError(new Error("InvalidAccountId"), "signIn");
    const b = mapAuthError(new Error("InvalidSecret"), "signIn");
    expect(a).toBe(b);
    expect(b).toBe("Incorrect email or password.");
  });

  it("InvalidAccountId on reset → existence-neutral message", () => {
    const err = new Error("InvalidAccountId");
    expect(mapAuthError(err, "reset")).toBe(
      "If an account with that email exists, we sent a code.",
    );
  });

  it("InvalidSecret on reset-verification → 'That code is incorrect or expired.'", () => {
    const err = new Error("InvalidSecret");
    expect(mapAuthError(err, "reset-verification")).toBe(
      "That code is incorrect or expired.",
    );
  });

  it("InvalidAccountId on reset-verification → still 'incorrect or expired' (don't leak)", () => {
    const err = new Error("InvalidAccountId");
    expect(mapAuthError(err, "reset-verification")).toBe(
      "That code is incorrect or expired.",
    );
  });

  it("signUp with 'account already exists' → friendly duplicate-account message", () => {
    const err = new Error("Error: account already exists");
    const out = mapAuthError(err, "signUp");
    expect(out.toLowerCase()).toContain("already exists");
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting error classes — should win regardless of flow
// ---------------------------------------------------------------------------

describe("mapAuthError — rate-limiting", () => {
  it("'rate limit' in message → 'Too many attempts' for signIn", () => {
    const out = mapAuthError(new Error("rate limit exceeded"), "signIn");
    expect(out.toLowerCase()).toContain("too many");
  });

  it("HTTP 429 prefix → 'Too many attempts' for signUp", () => {
    const out = mapAuthError(new Error("429 Too Many Requests"), "signUp");
    expect(out.toLowerCase()).toContain("too many");
  });

  it("'too many' keyword → rate-limit message even on reset", () => {
    const out = mapAuthError(new Error("too many requests"), "reset");
    expect(out.toLowerCase()).toContain("too many");
  });
});

describe("mapAuthError — network failures", () => {
  it("'Failed to fetch' → network message on signIn", () => {
    const out = mapAuthError(new Error("Failed to fetch"), "signIn");
    expect(out.toLowerCase()).toContain("network");
  });

  it("'NetworkError' → network message on signUp", () => {
    const out = mapAuthError(new Error("NetworkError when attempting"), "signUp");
    expect(out.toLowerCase()).toContain("network");
  });

  it("offline keyword → network message", () => {
    const out = mapAuthError(new Error("device is offline"), "reset");
    expect(out.toLowerCase()).toContain("network");
  });
});

// ---------------------------------------------------------------------------
// Default fallbacks — one per flow
// ---------------------------------------------------------------------------

describe("mapAuthError — default fallback per flow", () => {
  const flows: { flow: AuthFlow; expectMatch: RegExp }[] = [
    { flow: "signIn", expectMatch: /sign you in|sign in/i },
    { flow: "signUp", expectMatch: /create your account|account/i },
    { flow: "reset", expectMatch: /password reset|reset/i },
    { flow: "reset-verification", expectMatch: /update your password|password/i },
    { flow: "oauth", expectMatch: /apple|sign-in/i },
  ];

  it.each(flows)("$flow falls back to a flow-specific message", ({ flow, expectMatch }) => {
    const out = mapAuthError(new Error("totally unrecognised xyzzy"), flow);
    expect(out).toMatch(expectMatch);
    expect(out.length).toBeGreaterThan(8); // not empty / not "{}"
  });
});

// ---------------------------------------------------------------------------
// Defensiveness — never throw, regardless of input shape
// ---------------------------------------------------------------------------

describe("mapAuthError — defensive against weird inputs", () => {
  it("null input does not throw and returns a fallback", () => {
    expect(() => mapAuthError(null, "signIn")).not.toThrow();
    const out = mapAuthError(null, "signIn");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("undefined input does not throw", () => {
    expect(() => mapAuthError(undefined, "signIn")).not.toThrow();
  });

  it("empty object {} → falls back to flow default", () => {
    const out = mapAuthError({}, "signIn");
    expect(out).toMatch(/sign you in|sign in/i);
  });

  it("plain string input is matched as a message body", () => {
    // A raw string error body is a common Convex shape.
    const out = mapAuthError("InvalidSecret", "signIn");
    expect(out).toBe("Incorrect email or password.");
  });

  it("Convex .data.message wrapper is unwrapped", () => {
    const wrapped = { data: { message: "InvalidAccountId" } };
    expect(mapAuthError(wrapped, "signIn")).toBe("Incorrect email or password.");
  });

  it("Convex .data.message wrapper unwraps on reset flow too", () => {
    const wrapped = { data: { message: "InvalidAccountId" } };
    expect(mapAuthError(wrapped, "reset")).toBe(
      "If an account with that email exists, we sent a code.",
    );
  });

  it("numeric input does not throw", () => {
    expect(() => mapAuthError(42 as unknown, "signIn")).not.toThrow();
  });

  it("non-string .data.message (number/null) does not crash and falls back", () => {
    const out = mapAuthError({ data: { message: 500 } }, "signIn");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isValidEmail — minor adjacent helper exported from the same module.
// ---------------------------------------------------------------------------

describe("isValidEmail — quick sanity (adjacent helper)", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("  user.name+tag@example.com  ")).toBe(true);
  });

  it("rejects empty / no-at / no-dot", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("noatsign")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});
