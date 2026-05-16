/**
 * Convex Auth configuration.
 *
 * Exports the canonical `auth`, `signIn`, `signOut`, `store`, and
 * `isAuthenticated` helpers built from {@link convexAuth}. These are
 * referenced by the auto-generated `api`/`internal` modules and by
 * `convex/http.ts` (which calls `auth.addHttpRoutes(http)`).
 *
 * Providers:
 *  - Password (email + password, with reset flow)
 *  - Apple (OAuth — Services ID / Team ID / Key ID / p8 key are read
 *    from environment variables on the Convex deployment; see
 *    `auth.config.ts` for the env var contract.)
 *
 * Bootstrap:
 *  - `createOrUpdateUser` is invoked by Convex Auth after a successful
 *    sign-in. We use it to ensure a 1:1 `profiles` row exists for the
 *    auth user. Phase 3 will replace the inline insert below with a
 *    call to `internal.profiles.ensureExists` once that mutation lands.
 */
import { convexAuth } from "@convex-dev/auth/server";
import Apple from "@auth/core/providers/apple";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Email + password. Reset/verification email senders are stubbed for
    // now — see `auth.config.ts`. Phase 3 will wire up Resend (or similar).
    Password({
      // Custom profile shape: pull `role` out of the signIn params and
      // pass it through so `createOrUpdateUser` can persist it on the
      // freshly-created `profiles` row in the SAME transaction. Without
      // this the bootstrap row always defaults to `role: "fighter"` and
      // a coach signup races the client-side `profiles.setRole` patch.
      profile(params) {
        const email = params.email as string;
        const rawRole = (params as Record<string, unknown>).role;
        const role: "fighter" | "coach" =
          rawRole === "coach" ? "coach" : "fighter";
        return {
          email,
          // Stash on the user doc so `createOrUpdateUser` can read it via
          // `args.profile.role`. Convex Auth carries unknown keys through
          // the profile object verbatim.
          role,
        } as { email: string; role: "fighter" | "coach" };
      },
    }),

    // Apple Sign-In (OAuth). Provider config (clientId / clientSecret) is
    // read from env vars at runtime — see `auth.config.ts`. The redirect
    // URI on Apple's developer console must be set to:
    //   https://<your-convex-site-url>/api/auth/callback/apple
    Apple,
  ],

  // After Convex Auth creates (or updates) a `users` row, make sure the
  // app-side `profiles` row exists. We can't import a mutation reference
  // here without circular deps, so we do a minimal inline upsert via the
  // mutation context.
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      // If this is an existing user, just return their id.
      if (args.existingUserId) {
        return args.existingUserId;
      }

      // Brand-new sign-up: create the users row first.
      const userId = await ctx.db.insert("users", {
        email: args.profile.email,
        name: args.profile.name,
        image: args.profile.image,
        emailVerificationTime: args.profile.emailVerified
          ? Date.now()
          : undefined,
      });

      // Bootstrap a placeholder `profiles` row. Required fields are filled
      // with sensible defaults so the row is valid; the onboarding flow
      // will overwrite these. The `role` is sourced from the signIn
      // params (see `Password.profile` above) so a coach signup lands
      // `role: "coach"` atomically — the client never has to chase it
      // with a follow-up `profiles.setRole` patch.
      const profileRole: "fighter" | "coach" =
        (args.profile as Record<string, unknown>).role === "coach"
          ? "coach"
          : "fighter";
      try {
        await ctx.db.insert("profiles", {
          userId,
          age: 0,
          sex: "",
          heightCm: 0,
          currentWeightKg: 0,
          goalWeightKg: 0,
          targetDate: "",
          activityLevel: "",
          goalType: "",
          role: profileRole,
          // Starter gem pack — free users get 3 gems at signup; daily refill
          // tops the balance back up to 3 (cap) until they buy a subscription.
          gems: 3,
          lastFreeGemDate: new Date().toISOString().slice(0, 10),
          adsWatchedToday: 0,
          subscriptionTier: "free",
        });
      } catch (err) {
        // Defensive: if the schema rejects (e.g. during a migration where
        // profile fields shift), don't block the sign-in. The client can
        // call `profiles.ensureExists` to recover.
        console.warn("[auth] profile bootstrap failed", err);
      }

      return userId;
    },
  },
});
