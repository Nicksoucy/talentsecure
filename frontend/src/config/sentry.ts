/**
 * Sentry initialization for frontend.
 *
 * Activated only when VITE_SENTRY_DSN is set in the build env. If unset,
 * Sentry stays uninitialized — no script loaded, no telemetry, no overhead.
 *
 * Import this from main.tsx BEFORE rendering the app so boot-time errors
 * (lazy chunk load failures, etc.) are captured.
 */

import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  });
}

export const sentryEnabled = Boolean(dsn);
export { Sentry };
