import { z } from 'zod';

const phoneRegex = /^[\d\s+()-]{0,20}$/;

export const clientFormSchema = z.object({
  name: z.string().trim().min(2, 'Le nom du contact doit contenir au moins 2 caracteres').max(100),
  companyName: z.string().trim().max(150).optional().nullable(),
  email: z.string().trim().email('Adresse courriel invalide').max(255),
  phone: z.string().trim().regex(phoneRegex, 'Numero de telephone invalide').optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  province: z.string().trim().max(50),
  postalCode: z.string().trim().max(12).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;
