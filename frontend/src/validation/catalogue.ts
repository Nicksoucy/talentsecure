import { z } from 'zod';

export const catalogueFormSchema = z.object({
  title: z.string().trim().min(3, 'Le titre doit contenir au moins 3 caracteres').max(150),
  customMessage: z.string().trim().max(2000).optional().nullable(),
  clientId: z.string().min(1, 'Un client est requis'),
  candidateIds: z.array(z.string().min(1)).min(1, 'Ajoutez au moins un candidat'),
  includeSummary: z.boolean(),
  includeDetails: z.boolean(),
  includeVideo: z.boolean(),
  includeExperience: z.boolean(),
  includeSituation: z.boolean(),
  includeCV: z.boolean(),
});

export type CatalogueFormValues = z.infer<typeof catalogueFormSchema>;
