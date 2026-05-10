import type { NavigateFunction } from "react-router-dom";

type ExpectedRole = "fighter" | "coach";

interface ToastFn {
  (props: { title?: string; description?: string; variant?: "default" | "destructive" }): unknown;
}

/**
 * Branch a freshly-signed-in user to the correct dashboard.
 *
 * Post-Convex migration: the user's role lives on the `profiles` row that the
 * `UserContext.profile` Convex query keeps live. Callers should pass the
 * already-resolved `actualRole` (read from `useUser().profile?.role`) instead
 * of re-fetching it. When `actualRole` is unknown (e.g. on the very first
 * post-auth render), we fall back to the `expected` value the door encodes.
 *
 * @param userId — Convex `users._id` (unused here, but kept for API parity
 *                  with the legacy signature)
 * @param expected — which door they came in
 * @param navigate — react-router navigate
 * @param toast — useToast().toast
 * @param actualRole — optional override; usually `profile?.role` from context
 */
export async function routeAfterAuth(
  _userId: string,
  expected: ExpectedRole,
  navigate: NavigateFunction,
  toast: ToastFn,
  actualRole?: ExpectedRole | null,
): Promise<void> {
  void _userId;

  const role = actualRole ?? expected;

  if (role === expected) {
    navigate(expected === "coach" ? "/coach" : "/dashboard", { replace: true });
    return;
  }

  // Cross-door — warn but don't block
  if (role === "coach") {
    toast({ title: "This account is a coach", description: "Opening your coach dashboard." });
    try { localStorage.setItem("wcw_intended_role", "coach"); } catch {}
    navigate("/coach", { replace: true });
  } else {
    toast({ title: "This account is a fighter", description: "Opening your athlete dashboard." });
    try { localStorage.setItem("wcw_intended_role", "fighter"); } catch {}
    navigate("/dashboard", { replace: true });
  }
}
