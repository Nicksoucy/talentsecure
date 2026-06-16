import { describe, it, expect } from 'vitest';
import { compareSizes, sortBySize, isPantsSize } from './sizeOrder';

const sorted = (sizes: string[]) => [...sizes].sort(compareSizes);

describe('compareSizes', () => {
  it('trie les lettres XS → 3XL (et non alphabétiquement)', () => {
    expect(sorted(['2XL', '3XL', 'L', 'M', 'S', 'XL', 'XS'])).toEqual(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']);
  });

  it('trie les grandeurs de pantalon numériques croissantes', () => {
    expect(sorted(['38', '28', '34', '44', '30'])).toEqual(['28', '30', '34', '38', '44']);
  });

  it('trie les nouvelles grandeurs hybrides par tour de taille', () => {
    expect(sorted(['XL 42', 'Medium 32', 'Large 36', 'Medium 34', 'XL 40', 'Large 38'])).toEqual([
      'Medium 32', 'Medium 34', 'Large 36', 'Large 38', 'XL 40', 'XL 42',
    ]);
  });

  it('met « Unique » à la fin', () => {
    expect(sorted(['Unique', 'M', 'S'])).toEqual(['S', 'M', 'Unique']);
  });
});

describe('sortBySize', () => {
  it('trie des objets selon leur grandeur', () => {
    const variants = [{ size: 'XL' }, { size: 'S' }, { size: '2XL' }, { size: 'M' }];
    expect(sortBySize(variants, (v) => v.size).map((v) => v.size)).toEqual(['S', 'M', 'XL', '2XL']);
  });
});

describe('isPantsSize', () => {
  it('reconnaît les grandeurs numériques et hybrides', () => {
    expect(isPantsSize('34')).toBe(true);
    expect(isPantsSize('Medium 32')).toBe(true);
    expect(isPantsSize('XL 40')).toBe(true);
    expect(isPantsSize('2XL')).toBe(false);
    expect(isPantsSize('M')).toBe(false);
  });
});
