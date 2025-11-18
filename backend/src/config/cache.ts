import { createClient, RedisClientType } from 'redis';
import logger from './logger';

const CACHE_ENABLED = process.env.CACHE_ENABLED === 'true';
const REDIS_URL = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}`;
const DEFAULT_TTL = Number(process.env.CACHE_DEFAULT_TTL || 60);

let client: RedisClientType | null = null;

if (CACHE_ENABLED) {
  client = createClient({ url: REDIS_URL });

  client.on('error', (err) => {
    logger.error('Erreur Redis', { err });
  });

  client.connect()
    .then(() => {
      logger.info('Connexion Redis etablie');
    })
    .catch((err) => {
      logger.error('Impossible de se connecter a Redis', { err });
    });
}

export const cacheClient = client;

export const isCacheReady = () => Boolean(cacheClient?.isOpen);

export async function getCache<T>(key: string): Promise<T | null> {
  if (!isCacheReady()) return null;
  const value = await cacheClient!.get(key);
  return value ? JSON.parse(value) as T : null;
}

export async function setCache(key: string, value: unknown, ttl = DEFAULT_TTL): Promise<void> {
  if (!isCacheReady()) return;
  await cacheClient!.set(key, JSON.stringify(value), { EX: ttl });
}

export async function deleteCache(key: string): Promise<void> {
  if (!isCacheReady()) return;
  await cacheClient!.del(key);
}

export async function invalidateCacheByPrefix(prefix: string): Promise<void> {
  if (!isCacheReady()) return;
  const iterator = cacheClient!.scanIterator({ MATCH: `${prefix}:*` });
  for await (const key of iterator) {
    await cacheClient!.del(key as string);
  }
}
