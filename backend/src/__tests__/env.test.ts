/**
 * Tests for the env validator at backend/src/config/env.ts.
 *
 * env.ts runs its checks at module load time, so each scenario must
 * - reset env vars
 * - clear the require cache for the env module
 * - re-require it inside expect(...).toThrow / not.toThrow
 *
 * No DB needed — these are pure side-effect-on-import checks.
 */

const ENV_KEYS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'] as const;

const STRONG_SECRET = 'a'.repeat(40);

describe('config/env validator', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  beforeEach(() => {
    jest.resetModules();
    for (const key of ENV_KEYS) {
      process.env[key] = STRONG_SECRET;
    }
    process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
  });

  it('loads silently when all required vars are present and strong', () => {
    expect(() => require('../config/env')).not.toThrow();
  });

  it('throws if JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => require('../config/env')).toThrow(/JWT_SECRET/);
  });

  it('throws if JWT_REFRESH_SECRET is missing', () => {
    delete process.env.JWT_REFRESH_SECRET;
    expect(() => require('../config/env')).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('throws if DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => require('../config/env')).toThrow(/DATABASE_URL/);
  });

  it('rejects the well-known default placeholder', () => {
    process.env.JWT_SECRET = 'your-secret-key';
    expect(() => require('../config/env')).toThrow(/JWT_SECRET/);
  });

  it('rejects secrets shorter than 32 chars', () => {
    process.env.JWT_SECRET = 'too-short';
    expect(() => require('../config/env')).toThrow(/au moins 32/);
  });

  it('treats blank strings as missing', () => {
    process.env.JWT_REFRESH_SECRET = '   ';
    expect(() => require('../config/env')).toThrow(/JWT_REFRESH_SECRET/);
  });
});
