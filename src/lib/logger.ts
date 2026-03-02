import * as Sentry from "@sentry/react";

const isDev = import.meta.env.DEV;

export const logger = {
  error(msg: string, error?: unknown, context?: Record<string, unknown>) {
    if (isDev) {
      console.error(`[ERROR] ${msg}`, error ?? "", context ?? "");
    }
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: { message: msg, ...context } });
    } else if (error) {
      Sentry.captureException(new Error(msg), {
        extra: { originalError: String(error), ...context },
      });
    } else {
      Sentry.captureMessage(msg, { level: "error", extra: context });
    }
  },

  warn(msg: string, data?: Record<string, unknown>) {
    if (isDev) {
      console.warn(`[WARN] ${msg}`, data ?? "");
    }
    Sentry.addBreadcrumb({
      message: msg,
      level: "warning",
      data,
    });
  },

  info(msg: string, data?: Record<string, unknown>) {
    if (isDev) {
      console.log(`[INFO] ${msg}`, data ?? "");
    }
  },
};
