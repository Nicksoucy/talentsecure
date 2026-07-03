/**
 * Extrait un message lisible d'une erreur axios selon l'enveloppe d'erreur du
 * backend (P2-B) : `{ success:false, code, message, error, details? }` où
 * `error` est l'alias rétro-compatible de `message` et `details` porte les
 * erreurs de validation Zod (`[{ field, message }]`).
 */
export function getApiErrorMessage(e: unknown, fallback = 'Erreur'): string {
  const err = e as any;
  const data = err?.response?.data;
  if (data) {
    const msg = data.message || data.error; // message d'abord (error = alias legacy)
    const details = Array.isArray(data.details) && data.details.length
      ? ' — ' +
        data.details
          .map((d: any) => (d?.field ? `${d.field}: ${d.message}` : d?.message))
          .filter(Boolean)
          .join(' · ')
      : '';
    if (msg) return `${msg}${details}`;
  }
  if (err?.request && !err?.response) return 'Erreur réseau — serveur injoignable';
  return err?.message || fallback;
}
