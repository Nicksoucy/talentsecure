import crypto from 'crypto';

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
};

export const buildCacheKey = (prefix: string, payload: unknown) => {
  const normalized = sortValue(payload);
  const hash = crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
  return `${prefix}:${hash}`;
};
