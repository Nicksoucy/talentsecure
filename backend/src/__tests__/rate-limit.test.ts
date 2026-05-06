/**
 * Tests for backend/src/middleware/rate-limit.middleware.ts.
 *
 * Validates that limiters block after the configured threshold and that
 * skipInTests behaves correctly when NODE_ENV is flipped to non-test.
 * No DB needed — express-rate-limit's default in-memory store is enough.
 */

import express from 'express';
import request from 'supertest';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe('rate-limit middleware', () => {
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    jest.resetModules();
  });

  it('skipInTests bypasses the limiter when NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    jest.resetModules();
    const { loginLimiter } = require('../middleware/rate-limit.middleware');

    const app = express();
    app.post('/login', loginLimiter, (_req, res) => res.status(401).json({ error: 'bad creds' }));

    // 10 attempts > 5/15min limit. All return 401, none return 429.
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/login');
      expect(res.status).toBe(401);
    }
  });

  it('loginLimiter returns 429 after 5 failed attempts when not in test mode', async () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { loginLimiter } = require('../middleware/rate-limit.middleware');

    const app = express();
    app.set('trust proxy', false);
    app.post('/login', loginLimiter, (_req, res) => res.status(401).json({ error: 'bad creds' }));

    // 5 failed attempts allowed
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/login');
      expect(res.status).toBe(401);
    }

    // 6th gets blocked
    const blocked = await request(app).post('/login');
    expect(blocked.status).toBe(429);
  });

  it('loginLimiter does NOT count successful attempts (skipSuccessfulRequests)', async () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { loginLimiter } = require('../middleware/rate-limit.middleware');

    const app = express();
    app.post('/login', loginLimiter, (_req, res) => res.status(200).json({ ok: true }));

    // 20 successful attempts must all pass
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post('/login');
      expect(res.status).toBe(200);
    }
  });

  it('publicShareLimiter returns 429 after 30 requests in a minute', async () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { publicShareLimiter } = require('../middleware/rate-limit.middleware');

    const app = express();
    app.get('/share/:token', publicShareLimiter, (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 30; i++) {
      const res = await request(app).get('/share/abc');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get('/share/abc');
    expect(blocked.status).toBe(429);
  });
});
