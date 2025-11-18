import { z } from 'zod';

export const prospectContactSchema = z.object({
  notes: z.string().trim().max(2000, 'Les notes ne doivent pas dépasser 2000 caractères').optional().nullable(),
});

export type ProspectContactValues = z.infer<typeof prospectContactSchema>;
