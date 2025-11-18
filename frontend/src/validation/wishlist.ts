import { z } from 'zod';

export const wishlistFormSchema = z.object({
  title: z.string().trim().min(3, 'Le titre doit contenir au moins 3 caracteres').max(150),
  description: z.string().trim().max(2000).optional().nullable(),
  clientId: z.string().min(1, 'Client requis'),
  candidateIds: z.array(z.string().min(1)).min(1, 'Ajoutez au moins un candidat'),
});

export type WishlistFormValues = z.infer<typeof wishlistFormSchema>;
