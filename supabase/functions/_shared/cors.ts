const ALLOWED_ORIGINS = [
  "http://localhost:8080",       // Vite dev
  "http://localhost:8100",       // Capacitor live-reload
  "capacitor://localhost",       // iOS Capacitor WebView
  "http://localhost",            // generic localhost
];

// Allow adding production domain via env var (set in Supabase dashboard)
const PROD_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");
if (PROD_ORIGIN) ALLOWED_ORIGINS.push(PROD_ORIGIN);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Vary": "Origin",
  };
}
