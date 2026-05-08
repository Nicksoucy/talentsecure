/**
 * Tests for backend/src/utils/token.ts — share token generation and
 * expiration helpers used by the public catalogue share flow.
 */

import { generateShareToken, getTokenExpiration, isTokenExpired } from '../utils/token';

describe('utils/token', () => {
  describe('generateShareToken', () => {
    it('produces a base64url-safe string by default (no +/= chars)', () => {
      const token = generateShareToken();
      // base64url uses [A-Za-z0-9_-]
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('returns ~43 characters for the default 32-byte length', () => {
      const token = generateShareToken();
      // 32 bytes → 43 base64url chars (no padding)
      expect(token.length).toBeGreaterThanOrEqual(42);
      expect(token.length).toBeLessThanOrEqual(44);
    });

    it('returns unique tokens across repeated calls', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateShareToken());
      }
      // 100 calls should produce 100 distinct tokens (collision probability is
      // astronomically small with 256 bits of entropy)
      expect(tokens.size).toBe(100);
    });

    it('respects custom byte length', () => {
      const longToken = generateShareToken(64);
      // 64 bytes → ~86 base64url chars
      expect(longToken.length).toBeGreaterThanOrEqual(84);
    });
  });

  describe('getTokenExpiration', () => {
    it('returns a date 30 days in the future by default', () => {
      const now = Date.now();
      const expiry = getTokenExpiration().getTime();
      const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(29.9);
      expect(diffDays).toBeLessThan(30.1);
    });

    it('accepts a custom day offset', () => {
      const now = Date.now();
      const expiry = getTokenExpiration(7).getTime();
      const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(6.9);
      expect(diffDays).toBeLessThan(7.1);
    });
  });

  describe('isTokenExpired', () => {
    it('returns false for null / no expiration', () => {
      expect(isTokenExpired(null)).toBe(false);
    });

    it('returns false for a future date', () => {
      const future = new Date(Date.now() + 1000 * 60);
      expect(isTokenExpired(future)).toBe(false);
    });

    it('returns true for a past date', () => {
      const past = new Date(Date.now() - 1000 * 60);
      expect(isTokenExpired(past)).toBe(true);
    });
  });
});
