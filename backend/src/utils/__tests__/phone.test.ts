import { lastTenDigits } from '../phone';

describe('lastTenDigits', () => {
  it('extrait les 10 derniers chiffres, quel que soit le format', () => {
    expect(lastTenDigits('+1 (438) 555-1234')).toBe('4385551234');
    expect(lastTenDigits('438.555.1234')).toBe('4385551234');
    expect(lastTenDigits('438-555-1234')).toBe('4385551234');
    expect(lastTenDigits('14385551234')).toBe('4385551234');
  });

  it('renvoie vide pour null / undefined / chaîne vide', () => {
    expect(lastTenDigits(null)).toBe('');
    expect(lastTenDigits(undefined)).toBe('');
    expect(lastTenDigits('')).toBe('');
    expect(lastTenDigits('aucun chiffre')).toBe('');
  });

  it('numéro plus court que 10 chiffres → renvoie ce qu\'il y a', () => {
    expect(lastTenDigits('555-1234')).toBe('5551234');
  });
});
