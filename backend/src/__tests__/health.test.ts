import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';

/**
 * Sondes de santé. La liveness doit TOUJOURS répondre 200 (sinon Cloud Run
 * redémarre le conteneur en cascade). La readiness vérifie la base (et Redis/R2
 * seulement s'ils sont activés — ici non → 'skipped' = ok). La base de test
 * étant en ligne, readiness doit être 200/ok.
 */
describe('Health endpoints', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it('GET /health (liveness) → 200 + statut OK, sans dépendance', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'OK' });
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.body).toHaveProperty('environment');
  });

  it('GET /health/live → 200 (alias liveness)', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  it('GET /health/ready → 200, base OK, Redis/R2 ignorés en test', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.status).toBe('ok');
    expect(['ok', 'skipped']).toContain(res.body.checks.redis.status);
    expect(['ok', 'skipped']).toContain(res.body.checks.r2.status);
  });
});
