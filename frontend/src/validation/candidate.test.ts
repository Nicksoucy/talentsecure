import { describe, it, expect } from 'vitest';
import { candidateFormSchema } from './candidate';

const base = { firstName: 'Jean', lastName: 'Tremblay' };

describe('candidateFormSchema', () => {
  it('accepte le minimum (prénom + nom)', () => {
    expect(candidateFormSchema.safeParse(base).success).toBe(true);
  });

  it('rejette un prénom / nom < 2 caractères', () => {
    expect(candidateFormSchema.safeParse({ firstName: 'J', lastName: 'Tremblay' }).success).toBe(false);
    expect(candidateFormSchema.safeParse({ firstName: 'Jean', lastName: 'T' }).success).toBe(false);
  });

  it('email vide → null, email invalide rejeté, email valide accepté', () => {
    const empty = candidateFormSchema.safeParse({ ...base, email: '' });
    expect(empty.success).toBe(true);
    expect(empty.success && empty.data.email).toBeNull();

    expect(candidateFormSchema.safeParse({ ...base, email: 'pas-un-email' }).success).toBe(false);
    expect(candidateFormSchema.safeParse({ ...base, email: 'jean@example.com' }).success).toBe(true);
  });

  it('date optionnelle : "" → null, date malformée rejetée, date valide acceptée', () => {
    const empty = candidateFormSchema.safeParse({ ...base, interviewDate: '' });
    expect(empty.success).toBe(true);
    expect(empty.success && empty.data.interviewDate).toBeNull();

    expect(candidateFormSchema.safeParse({ ...base, interviewDate: '2026/06/19' }).success).toBe(false);
    expect(candidateFormSchema.safeParse({ ...base, interviewDate: '2026-06-19' }).success).toBe(true);
  });

  it('bspStatus : "" → null, enum invalide rejeté, enum valide accepté', () => {
    const empty = candidateFormSchema.safeParse({ ...base, bspStatus: '' });
    expect(empty.success).toBe(true);
    expect(empty.success && empty.data.bspStatus).toBeNull();

    expect(candidateFormSchema.safeParse({ ...base, bspStatus: 'PEUT-ETRE' }).success).toBe(false);
    expect(candidateFormSchema.safeParse({ ...base, bspStatus: 'VALID' }).success).toBe(true);
  });

  it('globalRating hors [0,10] rejeté', () => {
    expect(candidateFormSchema.safeParse({ ...base, globalRating: 11 }).success).toBe(false);
    expect(candidateFormSchema.safeParse({ ...base, globalRating: -1 }).success).toBe(false);
    expect(candidateFormSchema.safeParse({ ...base, globalRating: 8.5 }).success).toBe(true);
  });

  it('passthrough : conserve les champs supplémentaires', () => {
    const r = candidateFormSchema.safeParse({ ...base, champExtra: 'gardé' });
    expect(r.success).toBe(true);
    expect(r.success && (r.data as Record<string, unknown>).champExtra).toBe('gardé');
  });
});
