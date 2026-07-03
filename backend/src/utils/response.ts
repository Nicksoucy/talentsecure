import type { Response } from 'express';
import { ApiError } from './apiError';

interface SuccessOptions {
  meta?: Record<string, unknown>;
  message?: string;
}

export const successResponse = <T>(res: Response, data: T, options: SuccessOptions = {}) => {
  const { meta, message } = options;
  return res.status(res.statusCode || 200).json({
    success: true,
    ...(message ? { message } : {}),
    data,
    ...(meta ? { meta } : {}),
  });
};

export const errorResponse = (res: Response, error: ApiError, requestId?: string) => {
  const payload: Record<string, unknown> = {
    success: false,
    code: error.errorCode,
    message: error.message,
    // Alias rétro-compatible (P2-B) : pont de migration pour basculer les ~150
    // réponses ad hoc `res.json({ error })` vers ApiError sans casser les
    // consommateurs/tests qui lisent encore `error`. À RETIRER une fois tout le
    // code (front + tests) aligné sur `message`/`code`.
    error: error.message,
  };

  if (error.details?.length) {
    payload.details = error.details;
  }

  if (requestId) {
    payload.requestId = requestId;
  }

  return res.status(error.statusCode).json(payload);
};
