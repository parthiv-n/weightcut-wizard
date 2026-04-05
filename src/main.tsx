import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
    sendDefaultPii: false,
    ignoreErrors: [
      "ResizeObserver loop",
      "AbortError",
      "Failed to fetch",
      "Load failed",
      "NetworkError",
      "timed out after",
      "Authentication operation timed out",
      "useAuth must be used within",
      "useProfile must be used within",
    ],
  });
}

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  if (dsn) {
    Sentry.captureException(event.reason);
  }
});

createRoot(document.getElementById("root")!).render(<App />);
