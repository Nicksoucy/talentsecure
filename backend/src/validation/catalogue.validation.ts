import { z } from 'zod';

/**
 * Validation catalogue. NON-BLOQUANT (`.passthrough()`) : on reflète la garde
 * inline du controller (`if (!clientId || !title)`) et on laisse passer les
 * autres champs (booléens d'inclusion, candidateIds…) tels quels. `clientId`
 * reste une chaîne libre (un id inexistant doit donner 404, pas 400).
 */
export const createCatalogueSchema = z
  .object({
    clientId: z.string().min(1, 'clientId requis'),
    title: z.string().min(1, 'Titre requis').max(300),
    customMessage: z.string().max(5000).optional().nullable(),
    candidateIds: z.array(z.string()).optional(),
  })
  .passthrough();

export const updateCatalogueSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    customMessage: z.string().max(5000).optional().nullable(),
    candidateIds: z.array(z.string()).optional(),
  })
  .passthrough();
