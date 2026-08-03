import { GhlApiError, GhlConfigError, getGhlToken, getGhlLocationId, isGhlConfigured } from '../services/ghl.client';

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
