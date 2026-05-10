/**
 * Convex client.
 *
 * Exposes a single
 * `ConvexReactClient` instance that the app-wide
 * `<ConvexAuthProvider client={convex}>` (mounted in `main.tsx`) wires
 * up. All Convex hooks (`useQuery`, `useMutation`, `useAction`,
 * `useConvexAuth`, `useAuthActions`) read from this client via the
 * provider — components should NOT import `convex` directly unless they
 * need a one-off `convex.action(...)` or `convex.query(...)` call.
 *
 * Reads `import.meta.env.VITE_CONVEX_URL`. Set this in `.env.local` after
 * running `npx convex dev` (the CLI prints the URL on first run and also
 * writes it to `.env.local` itself).
 */
import { ConvexReactClient } from "convex/react";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;

if (!CONVEX_URL) {
  // Fail loud — without a deployment URL the client constructor would
  // throw an opaque "Invalid URL" error from inside Convex. Surfacing
  // this here gives developers a clearer next-step.
  console.error(
    "[convex] VITE_CONVEX_URL is not set. Run `npx convex dev` once " +
      "to create a deployment, then add VITE_CONVEX_URL to .env.local.",
  );
}

export const convex = new ConvexReactClient(CONVEX_URL ?? "https://invalid.convex.cloud");
