/**
 * Scheduler in-process basé sur node-cron.
 *
 * Démarré au boot du serveur (server.ts). Nécessite `min-instances=1` sur
 * Cloud Run pour rester actif. Si l'instance est tuée, les jobs ne tournent
 * pas — fallback : Cloud Scheduler GCP appelant `/api/notifications/internal/dispatch`.
 *
 * Jobs :
 *   - Toutes les 5 min : dispatchPendingNotifications (email + in-app)
 *   - Toutes les heures (à xx:00) : surveillanceJob (10 checks)
 */
import cron from 'node-cron';
import { dispatchPendingNotifications } from '../services/notification.service';
import { surveillanceJob } from './uniform-surveillance';

let started = false;

export function startScheduler() {
  if (started) {
    console.warn('[scheduler] already started');
    return;
  }
  started = true;

  // Dispatch toutes les 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await dispatchPendingNotifications();
      if (result.sent > 0 || result.failed > 0) {
        console.log(`[scheduler] dispatch: sent=${result.sent} failed=${result.failed}`);
      }
    } catch (e) {
      console.error('[scheduler] dispatch error:', e);
    }
  });

  // Surveillance toutes les heures à minute 0
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await surveillanceJob();
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      console.log(`[scheduler] surveillance: ${total} notifs créées`, result);
    } catch (e) {
      console.error('[scheduler] surveillance error:', e);
    }
  });

  console.log('[scheduler] started — dispatch every 5min, surveillance hourly');
}
