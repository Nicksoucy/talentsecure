import type { User, Candidate } from '@/types';

// Compteur pour des ids uniques et déterministes entre les tests.
let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${++seq}`;

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: nextId('user'),
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'ADMIN',
    ...overrides,
  } as User;
}

export function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: nextId('cand'),
    firstName: 'Jean',
    lastName: 'Tremblay',
    email: 'jean.tremblay@example.com',
    phone: '514-555-0100',
    city: 'Montréal',
    status: 'EN_ATTENTE',
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Candidate;
}
