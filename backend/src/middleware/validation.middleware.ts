import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Validation middleware factory
 * Creates middleware that validates request body, params, or query against a Zod schema
 */
export const validateRequest = (
  schema: z.ZodSchema,
  target: 'body' | 'params' | 'query' = 'body'
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate the specified part of the request
      const validated = await schema.parseAsync(req[target]);

      // Replace the original data with the validated (and potentially transformed) data
      req[target] = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format validation errors for better readability
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          error: 'Validation échouée',
          details: formattedErrors,
        });
      }

      // Pass other errors to the global error handler
      next(error);
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
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors: any[] = [];

      // Validate body if schema provided
      if (schemas.body) {
        try {
          req.body = await schemas.body.parseAsync(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(...error.errors.map(err => ({
              location: 'body',
              field: err.path.join('.'),
              message: err.message,
            })));
          }
        }
      }

      // Validate params if schema provided
      if (schemas.params) {
        try {
          req.params = await schemas.params.parseAsync(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(...error.errors.map(err => ({
              location: 'params',
              field: err.path.join('.'),
              message: err.message,
            })));
          }
        }
      }

      // Validate query if schema provided
      if (schemas.query) {
        try {
          req.query = await schemas.query.parseAsync(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push(...error.errors.map(err => ({
              location: 'query',
              field: err.path.join('.'),
              message: err.message,
            })));
          }
        }
      }

      // If any validation errors occurred, return them
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation échouée',
          details: errors,
        });
      }

      next();
    } catch (error) {
      // Pass unexpected errors to the global error handler
      next(error);
    }
  };
};
