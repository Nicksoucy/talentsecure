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
  };

  if (error.details?.length) {
    payload.details = error.details;
  }

  if (requestId) {
    payload.requestId = requestId;
  }

  return res.status(error.statusCode).json(payload);
};
