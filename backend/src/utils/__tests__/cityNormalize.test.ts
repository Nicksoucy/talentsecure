import {
  normalizeCityKey,
  tidyCity,
  canonicalCity,
  provinceFromPostalCode,
  resolveProvince,
} from '../cityNormalize';

describe('cityNormalize', () => {
  describe('normalizeCityKey', () => {
    it('minuscule, sans accents, sépare les tirets', () => {
      expect(normalizeCityKey('Trois-Rivières')).toBe('trois rivieres');
    });

    it('développe St/Ste → Saint/Sainte', () => {
      expect(normalizeCityKey('St-Jérôme')).toBe('saint jerome');
      expect(normalizeCityKey('Ste-Foy')).toBe('sainte foy');
    });

    it('retire le suffixe province/pays', () => {
      expect(normalizeCityKey('Montréal, QC')).toBe('montreal');
    });

    it('chaîne vide → vide', () => {
      expect(normalizeCityKey('')).toBe('');
      expect(normalizeCityKey(null)).toBe('');
    });
  });

  describe('tidyCity', () => {
    it('trim + compresse les espaces', () => {
      expect(tidyCity('  Laval   ')).toBe('Laval');
    });

    it('retire les suffixes empilés (garde accents/casse)', () => {
      expect(tidyCity('Montréal, Québec, Canada')).toBe('Montréal');
    });

    it('répare le mojibake (double encodage UTF-8)', () => {
      expect(tidyCity('Trois-Riviã¨res')).toBe('Trois-Rivières');
    });
  });

  describe('canonicalCity', () => {
    it('corrige une variante connue via alias', () => {
      expect(canonicalCity('Sherbrook')).toBe('Sherbrooke');
    });

    it('renvoie le nom canonique du seed (accents) depuis une saisie sans accent', () => {
      expect(canonicalCity('montreal')).toBe('Montréal');
    });

    it('laisse passer (proprement) une ville inconnue', () => {
      expect(canonicalCity('  Quelquepartville ')).toBe('Quelquepartville');
    });
  });

  describe('provinceFromPostalCode', () => {
    it('déduit la province de la 1re lettre', () => {
      expect(provinceFromPostalCode('H3Z 2Y7')).toBe('QC');
      expect(provinceFromPostalCode('K1A 0B1')).toBe('ON');
      expect(provinceFromPostalCode('V6B 1A1')).toBe('BC');
    });

    it('null si ce n\'est pas un code postal canadien', () => {
      expect(provinceFromPostalCode('bonjour')).toBeNull();
      expect(provinceFromPostalCode('')).toBeNull();
      expect(provinceFromPostalCode(null)).toBeNull();
    });
  });

  describe('resolveProvince', () => {
    it('priorité au code postal', () => {
      expect(resolveProvince({ postalCode: 'H3Z 2Y7', province: 'ON' })).toBe('QC');
    });

    it('sinon la province fournie', () => {
      expect(resolveProvince({ province: 'ON' })).toBe('ON');
    });

    it('sinon QC par défaut', () => {
      expect(resolveProvince({})).toBe('QC');
    });
  });
});
