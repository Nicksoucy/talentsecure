/**
 * Sentry initialization for backend.
 *
 * Activated only when SENTRY_DSN is set in the environment. If unset,
 * Sentry stays uninitialized — no telemetry, no overhead, app behaves
 * exactly as before. This makes it opt-in per environment (typically
 * enabled in production and staging, disabled in dev).
 *
 * Imported at the very top of server.ts so unhandled exceptions during
 * boot are captured.
 */

import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.K_REVISION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0'),
    sendDefaultPii: false,
    beforeSend(event) {
      // Drop noisy 4xx that don't need on-call attention
      const status = event.contexts?.response?.status_code;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        return null;
      }
      return event;
    },
  });
}

export const sentryEnabled = Boolean(dsn);
export { Sentry };
