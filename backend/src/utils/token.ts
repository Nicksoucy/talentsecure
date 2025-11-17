import crypto from 'crypto';

/**
 * Generate a secure random token for sharing
 * @param length - Length of the token in bytes (default: 32)
 * @returns A URL-safe random token
 */
export function generateShareToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Calculate expiration date for share token
 * @param days - Number of days until expiration (default: 30)
 * @returns Date object representing expiration time
 */
export function getTokenExpiration(days: number = 30): Date {
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + days);
  return expiration;
}

/**
 * Check if a token has expired
 * @param expiresAt - Expiration date
 * @returns True if expired, false otherwise
 */
export function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return new Date() > expiresAt;
}
