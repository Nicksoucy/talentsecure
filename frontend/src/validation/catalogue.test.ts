import { describe, it, expect } from 'vitest';
import { catalogueFormSchema } from './catalogue';

const valid = {
  title: 'Catalogue test',
  customMessage: 'Bonjour',
  clientId: 'client-1',
  candidateIds: ['cand-1', 'cand-2'],
  includeSummary: true,
  includeDetails: true,
  includeVideo: true,
  includeExperience: true,
  includeSituation: true,
  includeCV: true,
};

describe('catalogueFormSchema', () => {
  it('accepte un payload valide', () => {
    expect(catalogueFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejette un titre < 3 caractères', () => {
    const r = catalogueFormSchema.safeParse({ ...valid, title: 'ab' });
    expect(r.success).toBe(false);
  });

  it('rejette un clientId vide', () => {
    const r = catalogueFormSchema.safeParse({ ...valid, clientId: '' });
    expect(r.success).toBe(false);
  });

  it('rejette une liste de candidats vide', () => {
    const r = catalogueFormSchema.safeParse({ ...valid, candidateIds: [] });
    expect(r.success).toBe(false);
  });

  it('customMessage est optionnel', () => {
    const { customMessage, ...rest } = valid;
    void customMessage;
    expect(catalogueFormSchema.safeParse(rest).success).toBe(true);
  });

  it('exige les flags include* (booléens)', () => {
    const { includeVideo, ...rest } = valid;
    void includeVideo;
    expect(catalogueFormSchema.safeParse(rest).success).toBe(false);
  });
});
