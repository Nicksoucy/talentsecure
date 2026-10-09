import { formatPhoneFr, lastTenDigits } from '../phone';

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

describe('formatPhoneFr', () => {
  it('met en forme les numéros à 10 chiffres, garde les autres tels quels', () => {
    expect(formatPhoneFr('+15145721982')).toBe('(514) 572-1982');
    expect(formatPhoneFr('(514) 725-5846')).toBe('(514) 725-5846');
    expect(formatPhoneFr('123')).toBe('123');
    expect(formatPhoneFr(null)).toBe('');
  });
});
