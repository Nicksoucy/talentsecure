import type { ZodIssue } from 'zod';

export interface ErrorDetail {
  field?: string;
  message: string;
  location?: string;
}

const DEFAULT_MESSAGE = 'Erreur interne du serveur';
const DEFAULT_CODE = 'ERREUR_INTERNE';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: ErrorDetail[];

  constructor(statusCode: number, message = DEFAULT_MESSAGE, errorCode = DEFAULT_CODE, details?: ErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }

  static fromUnknown(error: unknown): ApiError {
    if (error instanceof ApiError) {
      return error;
    }

    if (error && typeof error === 'object' && 'statusCode' in error && typeof (error as any).statusCode === 'number') {
      const { statusCode, message } = error as { statusCode: number; message?: string };
      return new ApiError(statusCode, message || DEFAULT_MESSAGE);
    }

    // A5 (audit) — pour une 500 inconnue, ne PAS divulguer le message interne
    // (noms de tables/contraintes Prisma, chemins…). Le vrai message + la stack
    // sont loggés par le handler global ; le client ne voit qu'un message générique.
    return new ApiError(500, DEFAULT_MESSAGE);
  }

  static fromZodIssues(issues: ZodIssue[]): ApiError {
    const details: ErrorDetail[] = issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return new ApiError(400, 'Validation échouée', 'ERREUR_VALIDATION', details);
  }
}
