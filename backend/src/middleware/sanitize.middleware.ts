import { Request, Response, NextFunction } from 'express';
import xss from 'xss';

type Sanitizable = string | number | boolean | null | undefined | Record<string, any> | Array<any>;

const sanitizeValue = (value: Sanitizable): Sanitizable => {
  if (typeof value === 'string') {
    return xss(value.trim());
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item)) as Sanitizable;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, Sanitizable>>((acc, [key, val]) => {
      acc[key] = sanitizeValue(val as Sanitizable);
      return acc;
    }, {});
  }

  return value;
};

export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  if (req.query) {
    req.query = sanitizeValue(req.query) as any;
  }

  if (req.params) {
    req.params = sanitizeValue(req.params) as any;
  }

  next();
};
