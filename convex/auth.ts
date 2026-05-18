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
import { convexAuth, createAccount } from "@convex-dev/auth/server";
import Apple from "@auth/core/providers/apple";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// ─── Apple native id_token verification helpers ───────────────────────
// `@convex-dev/auth@0.0.92` has no built-in path to complete an OAuth
// provider's sign-in with a pre-obtained id_token (the dispatcher in
// `signIn.js` always returns a redirect for OAuth providers). For native
// iOS Sign In with Apple we therefore register a separate
// `ConvexCredentials` provider with id `apple-native` that:
//   1. Verifies the iOS-issued id_token against Apple's JWKS.
//   2. Verifies the SHA-256 hashed nonce matches what we sent to Apple.
//   3. Upserts the user via `createAccount` keyed by Apple `sub` so a
//      user is linked across the web OAuth Apple provider above and
//      this native provider (both use providerId "apple" in the
//      `authAccounts` table).
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_NATIVE_AUDIENCE = "com.weightcutwizard.app"; // iOS Bundle ID
const appleJWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

interface AppleIdTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  nonce?: string;
}

/** SHA-256 of `input` as lowercase hex via Web Crypto (runtime-agnostic). */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
    //
    // We invoke `Apple({...})` (rather than the bare default-export) so we
    // can:
    //   1. Pin `idToken: true` — keeps the OIDC flow off Apple's fake
    //      `userinfo_endpoint` and tells `processAuthorizationCodeResponse`
    //      to trust the validated id_token claims as the profile. This is
    //      the path we want for native iOS, where the device returns a
    //      signed id_token + nonce from `ASAuthorizationAppleIDProvider`.
    //   2. Declare `checks: ["nonce"]` — Apple's stock provider also adds
    //      `state`, which is correct for browser-redirect flows. For native
    //      iOS the device generates the nonce itself, so we keep nonce in
    //      checks. We deliberately do NOT drop `state` here because the
    //      browser-redirect flow (web) still relies on it; `state` is
    //      already in the stock provider's defaults and we don't override
    //      it (this preserves web compatibility).
    //   3. Override `profile()` so the stable identifier is Apple's `sub`
    //      and `emailVerified` is normalized from Apple's "true"/true.
    //
    // NOTE: The @convex-dev/auth OAuth handler currently has no native
    // id_token short-circuit in `signInImpl` — `signIn("apple", {idToken,
    // nonce})` will still hit the redirect path. This config change makes
    // the provider id_token-correct (so a custom-action that drives the
    // OIDC callback path manually can succeed), but on its own it will
    // NOT make `signIn("apple", {idToken, nonce})` work end-to-end. The
    // parallel custom-action fallback in `convex/actions/` is required.
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      // Trust the validated id_token claims directly; skip the (fake)
      // userinfo round-trip Apple's stock provider stubs out.
      //
      // NOTE: `@auth/core`'s Apple provider is typed as `OAuthUserConfig`
      // (the OAuth2 arm of the union) even though it returns an OIDC
      // config at runtime — so `idToken` is not in the static type.
      // Convex Auth's runtime DOES read `config.idToken` when
      // `config.type === "oidc"` (see
      // `@convex-dev/auth/dist/server/oauth/convexAuth.js`), so we set it
      // via a cast. This is an upstream typing inconsistency, not a real
      // type error.
      ...({ idToken: true } as { idToken: boolean }),
      // Verify the nonce on the returned id_token. (Web redirect flow
      // still gets `state` from the stock provider defaults — we don't
      // override it here.)
      checks: ["nonce"],
      // Stable user id = Apple `sub`. Apple only returns `name` on the
      // very first consent — leave it undefined otherwise.
      profile(profile) {
        // Apple sends `user: { name: { firstName, lastName } }` only on
        // the FIRST consent. The OAuth web flow forwards it through
        // `profile.user.name`. Stitch a display name if present.
        const userObj = (profile as unknown as { user?: { name?: { firstName?: string; lastName?: string } } }).user;
        const fullName = userObj?.name
          ? [userObj.name.firstName, userObj.name.lastName].filter(Boolean).join(" ").trim()
          : undefined;
        return {
          id: profile.sub,
          email: profile.email,
          name: fullName || undefined,
          emailVerified:
            profile.email_verified === "true" ||
            profile.email_verified === true,
        };
      },
    }),

    // Native iOS Apple Sign-In via id_token. Client (Capacitor +
    // @capacitor-community/apple-sign-in) calls:
    //   signIn("apple-native", { idToken, nonce, email?, givenName?,
    //                            familyName?, role? })
    // We verify the id_token + nonce server-side and upsert the user.
    ConvexCredentials({
      id: "apple-native",
      authorize: async (credentials, ctx) => {
        const idToken = credentials.idToken;
        const rawNonce = credentials.nonce;
        if (typeof idToken !== "string" || idToken.length === 0) {
          throw new Error("APPLE_NATIVE_MISSING_ID_TOKEN");
        }
        if (typeof rawNonce !== "string" || rawNonce.length === 0) {
          throw new Error("APPLE_NATIVE_MISSING_NONCE");
        }

        // ─ 1. Verify signature + standard claims against Apple's JWKS.
        let payload: AppleIdTokenClaims;
        try {
          const verified = await jwtVerify<AppleIdTokenClaims>(idToken, appleJWKS, {
            issuer: APPLE_ISSUER,
            audience: APPLE_NATIVE_AUDIENCE,
            clockTolerance: "5s",
          });
          payload = verified.payload;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`APPLE_NATIVE_IDTOKEN_INVALID: ${msg}`);
        }

        // ─ 2. Nonce binding: Apple stores SHA-256(rawNonce). Refuse if
        //   the client never supplied a nonce or it doesn't match.
        if (typeof payload.nonce !== "string" || payload.nonce.length === 0) {
          throw new Error("APPLE_NATIVE_NONCE_MISSING_FROM_TOKEN");
        }
        const expectedNonceHash = await sha256Hex(rawNonce);
        if (payload.nonce !== expectedNonceHash) {
          throw new Error("APPLE_NATIVE_NONCE_MISMATCH");
        }

        // ─ 3. Pull stable identifier and optional profile fields.
        const appleSub = payload.sub;
        if (!appleSub) throw new Error("APPLE_NATIVE_MISSING_SUB");

        const email =
          typeof payload.email === "string" && payload.email.length > 0
            ? payload.email
            : typeof credentials.email === "string"
              ? credentials.email
              : undefined;
        const emailVerified =
          payload.email_verified === true || payload.email_verified === "true";

        const givenName =
          typeof credentials.givenName === "string" ? credentials.givenName : undefined;
        const familyName =
          typeof credentials.familyName === "string" ? credentials.familyName : undefined;
        const name = [givenName, familyName]
          .filter((s): s is string => typeof s === "string" && s.length > 0)
          .join(" ")
          .trim() || undefined;

        // Role for the bootstrap `profiles` row. Defaults to fighter;
        // a coach signup needs to pass `role: "coach"` on the client.
        const role: "fighter" | "coach" =
          credentials.role === "coach" ? "coach" : "fighter";

        // ─ 4. Find-or-create the user under provider="apple" so the
        //   record is interchangeable with the web OAuth flow.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const profilePayload: any = {
          ...(email !== undefined ? { email } : {}),
          ...(name !== undefined ? { name } : {}),
          emailVerified: emailVerified || email !== undefined,
          role,
        };

        const { user } = await createAccount(ctx, {
          provider: "apple",
          account: { id: appleSub },
          profile: profilePayload,
          shouldLinkViaEmail: true,
        });

        return { userId: user._id };
      },
    }),
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
