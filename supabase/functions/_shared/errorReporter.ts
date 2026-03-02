/**
 * Lightweight Sentry reporter for Supabase edge functions.
 * Uses the Sentry HTTP Store API directly to avoid @sentry/deno cold-start overhead.
 */

interface SentryDSN {
  publicKey: string;
  host: string;
  projectId: string;
}

function parseDSN(dsn: string): SentryDSN | null {
  try {
    const url = new URL(dsn);
    return {
      publicKey: url.username,
      host: url.hostname,
      projectId: url.pathname.replace("/", ""),
    };
  } catch {
    return null;
  }
}

let _parsedDSN: SentryDSN | null | undefined;

function getDSN(): SentryDSN | null {
  if (_parsedDSN !== undefined) return _parsedDSN;
  const raw = Deno.env.get("SENTRY_DSN");
  _parsedDSN = raw ? parseDSN(raw) : null;
  return _parsedDSN;
}

export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
) {
  const dsn = getDSN();
  if (!dsn) return;

  const message =
    error instanceof Error ? error.message : String(error);
  const stack =
    error instanceof Error ? error.stack : undefined;

  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    level: "error",
    server_name: "supabase-edge",
    exception: {
      values: [
        {
          type: error instanceof Error ? error.constructor.name : "Error",
          value: message,
          stacktrace: stack
            ? {
                frames: stack
                  .split("\n")
                  .slice(1, 10)
                  .map((line: string) => ({ filename: line.trim() })),
              }
            : undefined,
        },
      ],
    },
    extra: context,
  };

  const url = `https://${dsn.host}/api/${dsn.projectId}/store/`;

  // Fire-and-forget — don't block the response
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}`,
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Silently fail — we don't want error reporting to cause errors
  });
}

export const edgeLogger = {
  error(msg: string, error?: unknown, context?: Record<string, unknown>) {
    console.error(`[ERROR] ${msg}`, error ?? "", context ?? "");
    captureError(error ?? new Error(msg), { message: msg, ...context });
  },

  warn(msg: string, data?: Record<string, unknown>) {
    console.warn(`[WARN] ${msg}`, data ?? "");
  },

  info(msg: string, data?: Record<string, unknown>) {
    console.log(`[INFO] ${msg}`, data ?? "");
  },
};
