import {
  GhlApiError, GhlConfigError, getGhlToken, getGhlLocationId, isGhlConfigured, findSubmittedPhoneByEmail,
} from '../services/ghl.client';

/**
 * Client GoHighLevel — src/services/ghl.client.ts
 *
 * Point d'entrée unique vers l'API GHL, extrait de 4 modules qui dupliquaient
 * la config (chacun avec un PIT de production en dur comme fallback).
 *
 * Ce fichier couvre surtout un piège de la migration axios → fetch : les
 * appelants historiques lisent la forme d'erreur d'axios
 * (`err.response.data.message`). Avec GhlApiError il n'y a pas de `.response`,
 * donc ils retombent sur `err.message` — qui DOIT donc porter l'explication de
 * GHL, sinon RH voit « envoi échoué » sans jamais savoir pourquoi.
 * Voir sms.service.ts:110 (sendFormSignatureLink).
 */

describe('GhlApiError — message exploitable par les appelants', () => {
  it('intègre le `message` renvoyé par GHL', () => {
    const err = new GhlApiError(422, '/conversations/messages', {
      message: 'The phone number is not SMS capable',
    });
    expect(err.message).toContain('The phone number is not SMS capable');
    expect(err.message).toContain('422');
  });

  it('accepte la variante `error`', () => {
    const err = new GhlApiError(400, '/contacts/', { error: 'Invalid locationId' });
    expect(err.message).toContain('Invalid locationId');
  });

  it('accepte un tableau de messages (validation GHL)', () => {
    const err = new GhlApiError(400, '/contacts/', { message: ['email must be an email'] });
    expect(err.message).toContain('email must be an email');
  });

  it('accepte un corps en texte brut', () => {
    const err = new GhlApiError(502, '/contacts/', 'Bad Gateway');
    expect(err.message).toContain('Bad Gateway');
  });

  it('reste lisible quand GHL ne dit rien', () => {
    const err = new GhlApiError(500, '/contacts/', null);
    expect(err.message).toBe('GHL /contacts/ → 500');
  });

  it('tronque un corps démesuré (pas de log de 2 Mo)', () => {
    const err = new GhlApiError(500, '/contacts/', { message: 'x'.repeat(5000) });
    expect(err.message.length).toBeLessThan(400);
  });

  it('conserve le corps structuré pour les appelants qui veulent creuser', () => {
    const body = { message: 'nope', extra: 42 };
    expect(new GhlApiError(400, '/x', body).body).toEqual(body);
  });
});

describe('configuration — aucune valeur par défaut', () => {
  const original = { token: process.env.GHL_PIT_TOKEN, loc: process.env.GHL_LOCATION_ID };

  afterEach(() => {
    process.env.GHL_PIT_TOKEN = original.token;
    process.env.GHL_LOCATION_ID = original.loc;
  });

  it('sans GHL_PIT_TOKEN → lève au lieu de retomber sur un token en dur', () => {
    delete process.env.GHL_PIT_TOKEN;
    expect(() => getGhlToken()).toThrow(GhlConfigError);
  });

  it('sans GHL_LOCATION_ID → lève aussi', () => {
    delete process.env.GHL_LOCATION_ID;
    expect(() => getGhlLocationId()).toThrow(GhlConfigError);
  });

  it('une valeur uniquement composée d’espaces compte comme absente', () => {
    process.env.GHL_PIT_TOKEN = '   ';
    expect(() => getGhlToken()).toThrow(GhlConfigError);
  });

  it('isGhlConfigured reflète la présence des deux variables', () => {
    process.env.GHL_PIT_TOKEN = 'pit-x';
    process.env.GHL_LOCATION_ID = 'loc-x';
    expect(isGhlConfigured()).toBe(true);

    delete process.env.GHL_LOCATION_ID;
    expect(isGhlConfigured()).toBe(false);
  });
});

describe('findSubmittedPhoneByEmail — numéro resté sur un contact GHL en double', () => {
  const original = { token: process.env.GHL_PIT_TOKEN, loc: process.env.GHL_LOCATION_ID, fetch: global.fetch };
  let fetchMock: jest.Mock;

  const respond = (submissions: unknown[]) =>
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ submissions }) });

  beforeEach(() => {
    process.env.GHL_PIT_TOKEN = 'pit-test';
    process.env.GHL_LOCATION_ID = 'loc-test';
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.GHL_PIT_TOKEN = original.token;
    process.env.GHL_LOCATION_ID = original.loc;
    global.fetch = original.fetch;
  });

  it('cherche les soumissions de la location par courriel', async () => {
    respond([]);
    await findSubmittedPhoneByEmail('  Marie@Test.com ');
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/forms/submissions');
    expect(url.searchParams.get('locationId')).toBe('loc-test');
    expect(url.searchParams.get('q')).toBe('marie@test.com');
  });

  it('prend le téléphone de la soumission la plus récente, courriel sans tenir compte de la casse', async () => {
    respond([
      { email: 'marie@test.com', createdAt: '2026-10-01T10:00:00Z', others: { email: 'marie@test.com', phone: '+15145550001' } },
      { email: 'MARIE@test.com', createdAt: '2026-10-27T04:08:54Z', others: { email: 'MARIE@test.com', phone: '+15145550002' } },
    ]);
    expect(await findSubmittedPhoneByEmail('marie@test.com')).toBe('+15145550002');
  });

  it('ignore une soumission dont le nom ressemble mais le courriel diffère', async () => {
    respond([
      { email: 'marie.autre@test.com', createdAt: '2026-10-27T00:00:00Z', others: { email: 'marie.autre@test.com', phone: '+15145550009' } },
    ]);
    expect(await findSubmittedPhoneByEmail('marie@test.com')).toBeNull();
  });

  it('passe à une soumission plus ancienne si la dernière n’a pas de téléphone', async () => {
    respond([
      { createdAt: '2026-10-27T00:00:00Z', others: { email: 'marie@test.com', phone: '' } },
      { createdAt: '2026-10-20T00:00:00Z', others: { email: 'marie@test.com', phone: '+15145550003' } },
    ]);
    expect(await findSubmittedPhoneByEmail('marie@test.com')).toBe('+15145550003');
  });

  it('courriel vide → aucun appel GHL', async () => {
    expect(await findSubmittedPhoneByEmail('   ')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
