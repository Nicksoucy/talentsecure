import { z } from 'zod';

/**
 * Validation du déplacement de contact (POST /api/contacts/move).
 * Reflète les gardes inline : sections ∈ {employee, candidate, prospect} et
 * fromId requis. NON-BLOQUANT (`.passthrough()`).
 */
const SECTION = z.enum(['employee', 'candidate', 'prospect'], {
  errorMap: () => ({ message: 'Section invalide (employee | candidate | prospect)' }),
});

export const moveContactSchema = z
  .object({
    fromSection: SECTION,
    toSection: SECTION,
    fromId: z.string().min(1, 'fromId requis'),
  })
  .passthrough();
