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
    ],
  });
}

createRoot(document.getElementById("root")!).render(<App />);
