// send-announcement-push — fans out a single announcement to APNs (iOS) and
// FCM (Android) using device tokens stored in public.device_tokens.
//
// Triggered by the AFTER INSERT trigger on public.gym_announcements (via
// pg_net). Reads recipients via the announcement_push_payload(uuid) RPC.
//
// Required env vars (set with `supabase secrets set`):
//   SUPABASE_URL                  — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY     — auto-provided
//   APNS_KEY_ID                   — 10-char key ID from Apple Developer
//   APNS_TEAM_ID                  — 10-char team ID
//   APNS_BUNDLE_ID                — e.g. com.weightcutwizard.app
//   APNS_KEY_P8                   — full PEM body of AuthKey_*.p8 (with newlines)
//   APNS_USE_SANDBOX              — "true" while in TestFlight; omit/false for prod
//   FCM_SERVER_KEY                — optional, for Android delivery (legacy HTTP API)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create as jwtCreate, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface PushRow {
  recipient_user_id: string;
  device_token: string;
  platform: "ios" | "android" | "web";
  gym_name: string;
  sender_name: string;
  body: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID");
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID");
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID");
const APNS_KEY_P8 = Deno.env.get("APNS_KEY_P8");
const APNS_HOST = Deno.env.get("APNS_USE_SANDBOX") === "true"
  ? "https://api.sandbox.push.apple.com"
  : "https://api.push.apple.com";

const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY");

let cachedJwt: { token: string; expires: number } | null = null;

/** Build (and cache for ~50min) the APNs ES256 provider JWT. */
async function getApnsJwt(): Promise<string | null> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_KEY_P8) return null;
  if (cachedJwt && Date.now() < cachedJwt.expires) return cachedJwt.token;

  const pem = APNS_KEY_P8.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const token = await jwtCreate(
    { alg: "ES256", typ: "JWT", kid: APNS_KEY_ID },
    { iss: APNS_TEAM_ID, iat: getNumericDate(0) },
    key
  );

  cachedJwt = { token, expires: Date.now() + 50 * 60 * 1000 };
  return token;
}

async function sendToApns(token: string, payload: { aps: any; data?: any }) {
  const jwt = await getApnsJwt();
  if (!jwt || !APNS_BUNDLE_ID) return { ok: false, reason: "apns-not-configured" };
  try {
    const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

async function sendToFcm(token: string, body: string, title: string) {
  if (!FCM_SERVER_KEY) return { ok: false, reason: "fcm-not-configured" };
  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        authorization: `key=${FCM_SERVER_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        notification: { title, body, sound: "default" },
        priority: "high",
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok");
  }
  if (req.method === "GET") {
    // warmup ping
    return new Response("ok");
  }

  let announcementId: string | null = null;
  try {
    const payload = await req.json();
    announcementId = payload?.announcement_id ?? null;
  } catch {}

  if (!announcementId) {
    return new Response(JSON.stringify({ error: "missing announcement_id" }), { status: 400 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: rows, error } = await sb.rpc("announcement_push_payload", {
    p_announcement_id: announcementId,
  });
  if (error) {
    console.error("RPC failed", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  const targets = (rows ?? []) as PushRow[];
  if (targets.length === 0) {
    return new Response(JSON.stringify({ delivered: 0, reason: "no-tokens" }));
  }

  const sample = targets[0];
  const title = `${sample.sender_name} · ${sample.gym_name}`;
  const body = sample.body.length > 240 ? sample.body.slice(0, 237) + "…" : sample.body;

  const results = await Promise.all(
    targets.map(async (t) => {
      if (t.platform === "ios") {
        return sendToApns(t.device_token, {
          aps: {
            alert: { title, body },
            sound: "default",
            "thread-id": `gym-${announcementId}`,
            "mutable-content": 1,
          },
          data: { announcement_id: announcementId, gym_name: t.gym_name },
        });
      }
      if (t.platform === "android") {
        return sendToFcm(t.device_token, body, title);
      }
      return { ok: false, reason: "unsupported-platform" };
    })
  );

  const delivered = results.filter((r) => r.ok).length;
  const failed = results.length - delivered;

  // Best-effort cleanup: drop tokens that returned 410 Gone (expired).
  // Done in a separate pass so it never blocks the dispatch.
  const expired: string[] = [];
  results.forEach((r, i) => {
    if (!r.ok && (r as any).status === 410) expired.push(targets[i].device_token);
  });
  if (expired.length > 0) {
    sb.from("device_tokens").delete().in("token", expired).then(() => {});
  }

  return new Response(JSON.stringify({ delivered, failed }), {
    headers: { "content-type": "application/json" },
  });
});
