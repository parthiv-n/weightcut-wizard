/**
 * Regression tests for `routeAfterAuth` and the extended door/redirect logic
 * in src/lib/roleRouter.ts (Agent B).
 *
 * Why these tests exist:
 *   - Production bug: a coach signing in via the fighter door briefly landed
 *     on `/dashboard` because the role wasn't resolved yet. The new contract
 *     requires `isRoleResolved=true` before navigating.
 *   - Deep-link / invite flows (`/join?code=…`, `/legal?tab=privacy`) must be
 *     honoured if role-compatible, otherwise we drop the redirect silently to
 *     prevent cross-role bounces.
 *   - Cross-door logins should toast + redirect to the actual role's home and
 *     persist `wcw_intended_role` so the next cold start opens the right door.
 *
 * We mock the `navigate` function and `toast` callable to assert exact call
 * shapes — no real router, no DOM, deterministic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { routeAfterAuth } from "@/lib/roleRouter";
import type { NavigateFunction } from "react-router-dom";

type Navigate = ReturnType<typeof vi.fn> & NavigateFunction;
type Toast = ReturnType<typeof vi.fn>;

function makeNavigate(): Navigate {
  return vi.fn() as unknown as Navigate;
}
function makeToast(): Toast {
  return vi.fn();
}

// A super-minimal localStorage stub for the `wcw_intended_role` write. We
// replace globalThis.localStorage per-test so cross-test bleed is impossible.
class MemStorage {
  store = new Map<string, string>();
  getItem(k: string) { return this.store.get(k) ?? null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
  key() { return null; }
  length = 0;
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

describe("routeAfterAuth — happy-path matched doors", () => {
  it("fighter through fighter door → /dashboard", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth("user1", "fighter", navigate, toast, "fighter", true);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
    expect(toast).not.toHaveBeenCalled();
  });

  it("coach through coach door → /coach", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth("user1", "coach", navigate, toast, "coach", true);
    expect(navigate).toHaveBeenCalledWith("/coach", { replace: true });
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("routeAfterAuth — cross-door logins", () => {
  it("coach signs in through fighter door → toast + /coach + persists intended role", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth("user1", "fighter", navigate, toast, "coach", true);

    expect(toast).toHaveBeenCalledTimes(1);
    const args = toast.mock.calls[0][0] as { title?: string };
    expect(args.title).toMatch(/coach/i);
    expect(navigate).toHaveBeenCalledWith("/coach", { replace: true });

    const stored = (globalThis as unknown as { localStorage: MemStorage })
      .localStorage.getItem("wcw_intended_role");
    expect(stored).toBe("coach");
  });

  it("fighter signs in through coach door → toast + /dashboard + persists intended role", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth("user1", "coach", navigate, toast, "fighter", true);

    expect(toast).toHaveBeenCalledTimes(1);
    const args = toast.mock.calls[0][0] as { title?: string };
    expect(args.title).toMatch(/fighter/i);
    expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true });

    const stored = (globalThis as unknown as { localStorage: MemStorage })
      .localStorage.getItem("wcw_intended_role");
    expect(stored).toBe("fighter");
  });
});

describe("routeAfterAuth — unresolved role guard", () => {
  it("actualRole=null AND isRoleResolved=false → does NOT navigate (defer)", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth("user1", "fighter", navigate, toast, null, false);
    expect(navigate).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("actualRole=null but isRoleResolved=true → falls back to expected role", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    // No actual role known, but the resolver has finished — assume expected.
    await routeAfterAuth("user1", "fighter", navigate, toast, null, true);
    expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });
});

describe("routeAfterAuth — pendingRedirect deep-links", () => {
  it("role-neutral /join?code=abc honoured for either role", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth(
      "user1", "fighter", navigate, toast, "fighter", true, "/join?code=abc",
    );
    expect(navigate).toHaveBeenCalledWith("/join?code=abc", { replace: true });

    const navigate2 = makeNavigate();
    const toast2 = makeToast();
    await routeAfterAuth(
      "user1", "coach", navigate2, toast2, "coach", true, "/join?code=abc",
    );
    expect(navigate2).toHaveBeenCalledWith("/join?code=abc", { replace: true });
  });

  it("/coach/team for a fighter → ignored, falls back to /dashboard", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth(
      "user1", "fighter", navigate, toast, "fighter", true, "/coach/team",
    );
    expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
    // Critical: we must NOT have navigated to /coach/team.
    expect(navigate).not.toHaveBeenCalledWith("/coach/team", expect.anything());
  });

  it("/dashboard for a coach → ignored, falls back to /coach", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth(
      "user1", "coach", navigate, toast, "coach", true, "/dashboard",
    );
    expect(navigate).toHaveBeenCalledWith("/coach", { replace: true });
    expect(navigate).not.toHaveBeenCalledWith("/dashboard", expect.anything());
  });

  it("/legal?tab=privacy honoured for fighter", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth(
      "user1", "fighter", navigate, toast, "fighter", true, "/legal?tab=privacy",
    );
    expect(navigate).toHaveBeenCalledWith("/legal?tab=privacy", { replace: true });
  });

  it("/legal?tab=privacy honoured for coach", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth(
      "user1", "coach", navigate, toast, "coach", true, "/legal?tab=privacy",
    );
    expect(navigate).toHaveBeenCalledWith("/legal?tab=privacy", { replace: true });
  });

  it("null pendingRedirect → uses role home", async () => {
    const navigate = makeNavigate();
    const toast = makeToast();
    await routeAfterAuth("user1", "fighter", navigate, toast, "fighter", true, null);
    expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });
});
