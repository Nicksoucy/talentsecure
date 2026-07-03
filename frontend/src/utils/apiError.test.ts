import { describe, it, expect } from 'vitest';
import { getApiErrorMessage } from './apiError';

describe('getApiErrorMessage', () => {
  it('privilégie message sur l’alias legacy error', () => {
    const e = { response: { data: { message: 'Message canonique', error: 'Alias legacy' } } };
    expect(getApiErrorMessage(e)).toBe('Message canonique');
  });

  it('retombe sur l’alias error quand message est absent', () => {
    const e = { response: { data: { error: 'Alias legacy' } } };
    expect(getApiErrorMessage(e)).toBe('Alias legacy');
  });

  it('concatène les détails de validation Zod', () => {
    const e = {
      response: {
        data: {
          message: 'Erreur de validation',
          details: [
            { field: 'issuanceId', message: 'issuanceId requis' },
            { message: 'au moins une ligne' },
          ],
        },
      },
    };
    expect(getApiErrorMessage(e)).toBe(
      'Erreur de validation — issuanceId: issuanceId requis · au moins une ligne'
    );
  });

  it('signale une erreur réseau quand la requête est partie sans réponse', () => {
    const e = { request: {}, message: 'Network Error' };
    expect(getApiErrorMessage(e)).toBe('Erreur réseau — serveur injoignable');
  });

  it('utilise e.message puis le fallback en dernier recours', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBe('boom');
    expect(getApiErrorMessage({}, 'Échec du chargement')).toBe('Échec du chargement');
    expect(getApiErrorMessage(undefined)).toBe('Erreur');
  });
});
