import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { routeAfterAuth } from "@/lib/roleRouter";

/**
 * Encapsulates the post-auth navigation handshake for `/auth` and
 * `/coach/login`. Waits for `isRoleResolved` before navigating, validates
 * any pending deep-link / invite, and replaces the history entry so the
 * auth screen never appears in the back stack.
 *
 * Shared signature (must NOT drift — the auth-modernization agent imports this).
 */
export interface AfterAuthRedirectOpts {
  /** Which door the user came in (the page invoking the hook). */
  expected: "fighter" | "coach";
  /** Optional deep link to honour after auth (e.g. `/join?code=ABC`). */
  pendingRedirect?: string | null;
  /** Bypass redirect entirely — used by password-reset where caller navigates. */
  skip?: boolean;
}

export function useAfterAuthRedirect(opts: AfterAuthRedirectOpts): void {
  const { expected, pendingRedirect, skip } = opts;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userId, profile, isRoleResolved } = useUser();

  useEffect(() => {
    if (skip) return;
    if (!userId) return;
    // Wait for the profile/role to land — see routeAfterAuth JSDoc for why.
    if (!isRoleResolved) return;

    const actualRole = profile?.role ?? null;
    void routeAfterAuth(
      userId,
      expected,
      navigate,
      toast,
      actualRole,
      isRoleResolved,
      pendingRedirect ?? null,
    );
  }, [userId, isRoleResolved, profile?.role, expected, pendingRedirect, skip, navigate, toast]);
}
