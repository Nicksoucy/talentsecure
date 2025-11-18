import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { ApiError, ErrorDetail } from '../utils/apiError';

type Target = 'body' | 'params' | 'query';

const mapZodErrors = (error: ZodError, location?: Target): ErrorDetail[] =>
  error.errors.map((err) => ({
    location,
    field: err.path.join('.'),
    message: err.message,
  }));

/**
 * Validation middleware factory
 * Creates middleware that validates request body, params, or query against a Zod schema
 */
export const validateRequest = (
  schema: z.ZodSchema,
  target: Target = 'body'
) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req[target]);
      req[target] = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new ApiError(400, 'Validation échouée', 'ERREUR_VALIDATION', mapZodErrors(error, target)));
      }

      return next(error);
    }
  };
};

/**
 * Combine multiple validation targets
 * Example: validate({ body: schema1, query: schema2 })
 */
export const validate = (schemas: {
  body?: z.ZodSchema;
  params?: z.ZodSchema;
  query?: z.ZodSchema;
}) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const errors: ErrorDetail[] = [];

    try {
      if (schemas.body) {
        try {
          req.body = await schemas.body.parseAsync(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(...mapZodErrors(error, 'body'));
          } else {
            return next(error);
          }
        }
      }

      if (schemas.params) {
        try {
          req.params = await schemas.params.parseAsync(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(...mapZodErrors(error, 'params'));
          } else {
            return next(error);
          }
        }
      }

      if (schemas.query) {
        try {
          req.query = await schemas.query.parseAsync(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(...mapZodErrors(error, 'query'));
          } else {
            return next(error);
          }
        }
      }

      if (errors.length > 0) {
        return next(new ApiError(400, 'Validation échouée', 'ERREUR_VALIDATION', errors));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
