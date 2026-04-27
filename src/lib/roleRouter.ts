import type { NavigateFunction } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

type ExpectedRole = "fighter" | "coach";

interface ToastFn {
  (props: { title?: string; description?: string; variant?: "default" | "destructive" }): unknown;
}

/**
 * Branch a freshly-signed-in user to the correct dashboard. Single
 * indexed-column read on `profiles.role` (sub-100ms). If the user came in
 * the "wrong" door (e.g. coach signing in via /auth), toast and route them
 * to the correct surface — no dead-ends, no lockouts.
 *
 * @param userId — auth.users.id from sign-in response
 * @param expected — which door they came in
 * @param navigate — react-router navigate
 * @param toast — useToast().toast
 * @param onFirstLogin — Apple sign-in path: if the profile row doesn't
 *                       exist yet, upsert with the door's role
 */
export async function routeAfterAuth(
  userId: string,
  expected: ExpectedRole,
  navigate: NavigateFunction,
  toast: ToastFn,
  onFirstLogin?: { upsertRole: ExpectedRole }
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  // First-ever login (Apple, no profile row yet) — seed it
  if (!data && onFirstLogin) {
    try {
      await supabase.from("profiles").upsert(
        { id: userId, role: onFirstLogin.upsertRole },
        { onConflict: "id" }
      );
      try { localStorage.setItem("wcw_intended_role", onFirstLogin.upsertRole); } catch {}
    } catch (err) {
      logger.warn("routeAfterAuth: first-login upsert failed", { err });
    }
    navigate(onFirstLogin.upsertRole === "coach" ? "/coach/setup" : "/dashboard", { replace: true });
    return;
  }

  if (error) {
    logger.warn("routeAfterAuth: profile read failed", { error });
    navigate(expected === "coach" ? "/coach" : "/dashboard", { replace: true });
    return;
  }

  const actual = (data?.role as ExpectedRole | null) ?? expected;

  if (actual === expected) {
    navigate(expected === "coach" ? "/coach" : "/dashboard", { replace: true });
    return;
  }

  // Cross-door — warn but don't block
  if (actual === "coach") {
    toast({ title: "This account is a coach", description: "Opening your coach dashboard." });
    try { localStorage.setItem("wcw_intended_role", "coach"); } catch {}
    navigate("/coach", { replace: true });
  } else {
    toast({ title: "This account is a fighter", description: "Opening your athlete dashboard." });
    try { localStorage.setItem("wcw_intended_role", "fighter"); } catch {}
    navigate("/dashboard", { replace: true });
  }
}
