/**
 * Drop-in replacement for `useAction(...)` on Convex AI actions that are
 * gem-gated server-side. Every gated AI action call site should use this
 * hook instead of `useAction` directly so a stale Convex `profile.subscription*`
 * row doesn't manifest as a user-visible `INSUFFICIENT_GEMS` for paying
 * premium users.
 *
 * Behaviour matches `useAction` exactly on the happy path. On a thrown
 * `INSUFFICIENT_GEMS` error, the returned function:
 *   1. Reads `customerInfo` from the RC SDK.
 *   2. If RC confirms premium, calls `api.actions.activatePremium` so
 *      Convex catches up to the real entitlement window.
 *   3. Refreshes the reactive profile query.
 *   4. Retries the original action exactly once. If it throws again, the
 *      error propagates so the UI's normal paywall/error path runs.
 *
 * Implementation detail: the convex/react `useAction` typings carry the
 * function's args/return through `FunctionReference`. Mirroring that shape
 * here keeps every existing call site type-safe with zero changes beyond
 * the function-name swap.
 */
import { useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useUser } from "@/contexts/UserContext";
import { callWithGemRecovery } from "@/lib/aiCallWrapper";

// Loosened action-function shape — the convex/react types are complex
// generics that don't widen cleanly across action signatures, so we
// re-derive the args/return inline at the call boundary.
type AnyActionRef = Parameters<typeof useAction>[0];

export function useAIAction<TRef extends AnyActionRef>(actionRef: TRef): ReturnType<typeof useAction<TRef>> {
  const rawAction = useAction(actionRef);
  const activatePremium = useAction(api.actions.activatePremium.run);
  const { refreshProfile } = useUser();

  return useCallback(
    ((args: unknown) =>
      callWithGemRecovery(
        rawAction as (a: unknown) => Promise<unknown>,
        args,
        {
          activatePremium: activatePremium as (a: { tier: string; expiresAt?: string | null }) => Promise<unknown>,
        },
        { onRecovered: async () => { await refreshProfile(); } },
      )) as unknown as ReturnType<typeof useAction<TRef>>,
    [rawAction, activatePremium, refreshProfile],
  );
}
