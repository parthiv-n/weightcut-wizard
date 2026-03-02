# Error Monitoring Setup Guide

This project uses **Sentry** for error monitoring across the React client and Supabase edge functions, with a structured logger replacing all raw `console` calls.

---

## Quick Start

### 1. Create a Sentry Project

1. Go to [sentry.io](https://sentry.io) and create a free account
2. Create a new project: **Platform = React**
3. Copy your **DSN** from the project settings (Settings > Client Keys)

### 2. Set Environment Variables

Add to your `.env` file:

```env
# Required for error reporting
VITE_SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/1234567

# Required for source map uploads (CI/CD builds only)
SENTRY_AUTH_TOKEN=your-auth-token
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=your-project-slug
```

**Local dev without Sentry**: The app works fine without `VITE_SENTRY_DSN`. Sentry init is skipped, and the logger falls back to dev console output only.

### 3. Edge Functions (Supabase)

Set the DSN as a Supabase secret:

```bash
supabase secrets set SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/1234567
```

---

## How It Works

### Client Logger (`src/lib/logger.ts`)

All client-side files use the structured logger instead of raw `console` calls:

```typescript
import { logger } from "@/lib/logger";

// Errors — captured by Sentry + console in dev
logger.error("Failed to load meals", error);
logger.error("API returned unexpected data", undefined, { status: 500, endpoint: "/meals" });

// Warnings — added as Sentry breadcrumbs + console in dev
logger.warn("Haptics not available", { reason: "not supported" });

// Info — dev console only, silent in production
logger.info("Meal plan generated", { mealCount: 5 });
```

| Method | Dev Console | Sentry |
|--------|-------------|--------|
| `logger.error()` | `[ERROR] ...` | Captured as exception |
| `logger.warn()` | `[WARN] ...` | Added as breadcrumb |
| `logger.info()` | `[INFO] ...` | No-op |

### Edge Function Logger (`supabase/functions/_shared/errorReporter.ts`)

Edge functions use `edgeLogger` which mirrors the client API:

```typescript
import { edgeLogger } from "../_shared/errorReporter.ts";

edgeLogger.error("Grok API error", error, { functionName: "analyze-meal", status: 500 });
edgeLogger.warn("Rate limit approaching", { remaining: 5 });
edgeLogger.info("Request received", { userId: "..." });
```

The edge reporter uses Sentry's HTTP Store API directly (no SDK) to avoid cold-start overhead. Errors are fire-and-forget — they never block the response.

### ErrorBoundary

The `<ErrorBoundary>` in `App.tsx` automatically captures React render crashes to Sentry with the component stack trace.

---

## Source Maps

Production builds generate source maps and upload them to Sentry (when `SENTRY_AUTH_TOKEN` is set), then delete the `.map` files from the deploy bundle. This means:

- Sentry shows **original TypeScript** file names and line numbers in error reports
- Users never download source maps (no bundle size impact, no code exposure)

For local builds without the auth token, source maps are generated but not uploaded (the Sentry Vite plugin is disabled).

---

## Sentry Dashboard Tips

### Useful Filters

- **`functionName:analyze-meal`** — filter edge function errors by function name
- **`transaction:/nutrition`** — filter by page route
- **Level: warning** — see breadcrumb trails leading up to errors

### Ignored Errors

These are auto-filtered (not sent to Sentry) to reduce noise:

- `ResizeObserver loop` — harmless browser warning
- `AbortError` — cancelled fetch requests (user navigated away)
- `Failed to fetch` / `Load failed` / `NetworkError` — offline/connectivity issues

### Performance

- **Trace sample rate**: 20% in production, 100% in dev
- **No Session Replay** — too heavy for mobile/Capacitor
- **No PII** — `sendDefaultPii: false`

---

## Development Workflow

### Writing New Code

Always use the logger instead of `console`:

```typescript
// In src/ files
import { logger } from "@/lib/logger";

// In edge functions
import { edgeLogger } from "../_shared/errorReporter.ts";
```

### Checking for Raw Console Calls

```bash
# Should only match logger.ts and errorReporter.ts
grep -r "console\.\(error\|warn\|log\)" src/ --include="*.ts" --include="*.tsx"
grep -r "console\.\(error\|warn\|log\)" supabase/functions/ --include="*.ts"
```

### Testing Error Reporting Locally

1. Set `VITE_SENTRY_DSN` in `.env`
2. Run `npm run dev`
3. Open the browser console — you'll see `[ERROR]`/`[WARN]`/`[INFO]` prefixed output
4. Throw a test error in a component — it should appear in Sentry within seconds
5. Check Sentry dashboard for the event with full stack trace

---

## Architecture Overview

```
src/
  lib/logger.ts              <- Client logger (wraps @sentry/react)
  main.tsx                   <- Sentry.init() runs here

supabase/functions/
  _shared/errorReporter.ts   <- Edge logger (raw HTTP to Sentry)

vite.config.ts               <- sentryVitePlugin for source map uploads
```
