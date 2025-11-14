/**
 * Utility functions for candidate management
 */

import { CandidateStatus } from '@prisma/client';

/**
 * Determine candidate status based on global rating
 * @param rating - Global rating (0-10)
 * @returns Appropriate CandidateStatus
 */
export function getStatusFromRating(rating: number | null): CandidateStatus {
  if (!rating) return 'EN_ATTENTE';

  if (rating >= 9.5) return 'ELITE';
  if (rating >= 9.0) return 'EXCELLENT';
  if (rating >= 8.5) return 'TRES_BON';
  if (rating >= 8.0) return 'BON';
  if (rating >= 7.0) return 'QUALIFIE';
  return 'A_REVOIR';
}
