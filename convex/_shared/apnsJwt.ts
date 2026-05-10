"use node";

/**
 * APNs provider JWT (ES256) generator.
 *
 * Apple requires every push request to carry a short-lived (max 60min) JWT
 * signed with the team's `.p8` private key. We cache the token for ~50min in
 * module-level state. Convex actions reuse the same Node container across
 * invocations within an instance, so this caching works just like the Deno
 * isolate cache did in the Supabase function.
 *
 * The `.p8` body must be passed via the `APNS_KEY_P8` env var, including the
 * `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines.
 */
import { webcrypto } from "node:crypto";

const subtle = webcrypto.subtle;

let cached: { token: string; expires: number } | null = null;

function b64url(input: Uint8Array | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(Buffer.from(cleaned, "base64"));
  return subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** Returns a valid APNs JWT, signing+caching as needed. Returns null if any
 *  of the required env vars are missing. */
export async function getApnsJwt(): Promise<string | null> {
  const APNS_KEY_ID = process.env.APNS_KEY_ID;
  const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
  const APNS_KEY_P8 = process.env.APNS_KEY_P8;
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_KEY_P8) return null;

  if (cached && Date.now() < cached.expires) return cached.token;

  const header = { alg: "ES256", typ: "JWT", kid: APNS_KEY_ID };
  const payload = { iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload),
  )}`;

  const key = await importPrivateKey(APNS_KEY_P8);
  const sigBuf = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  const token = `${signingInput}.${b64url(new Uint8Array(sigBuf))}`;
  cached = { token, expires: Date.now() + 50 * 60 * 1000 };
  return token;
}

export function apnsHost(): string {
  return process.env.APNS_USE_SANDBOX === "true"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
}
