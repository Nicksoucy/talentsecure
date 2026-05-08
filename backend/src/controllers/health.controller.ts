import { Request, Response } from 'express';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { prisma } from '../config/database';
import { cacheClient, isCacheReady } from '../config/cache';
import { useR2 } from '../services/r2.service';
import logger from '../config/logger';

const DEEP_CHECK_TIMEOUT_MS = 1500;

const CACHE_ENABLED = process.env.CACHE_ENABLED === 'true';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'talentsecure-videos';
const R2_ENDPOINT = process.env.R2_ENDPOINT;

type CheckStatus = 'ok' | 'down' | 'skipped';
type CheckResult = { status: CheckStatus; latencyMs?: number; error?: string };

const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race<T>([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const checkDatabase = async (): Promise<CheckResult> => {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DEEP_CHECK_TIMEOUT_MS, 'database');
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

const checkRedis = async (): Promise<CheckResult> => {
  if (!CACHE_ENABLED) return { status: 'skipped' };
  if (!isCacheReady() || !cacheClient) {
    return { status: 'down', error: 'Redis client not connected' };
  }
  const start = Date.now();
  try {
    await withTimeout(cacheClient.ping(), DEEP_CHECK_TIMEOUT_MS, 'redis');
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

const checkR2 = async (): Promise<CheckResult> => {
  if (!useR2) return { status: 'skipped' };
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return { status: 'down', error: 'R2 credentials not configured' };
  }
  const start = Date.now();
  try {
    const endpoint = R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const s3 = new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    await withTimeout(
      s3.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME })),
      DEEP_CHECK_TIMEOUT_MS,
      'r2',
    );
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/**
 * Liveness probe — fast, always 200 if the process can answer HTTP.
 * Cloud Run startup/liveness probes hit this. Do NOT add dependency checks
 * here, otherwise a Redis or R2 outage would cause Cloud Run to restart the
 * container (cascade failure).
 */
export const livenessHandler = (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'TalentSecure API en ligne',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
};

/**
 * Readiness probe — checks downstream dependencies (DB always, Redis only if
 * CACHE_ENABLED, R2 only if USE_R2). Returns 503 if any required dep is down.
 *
 * Useful for: dashboards, on-call alerts, deciding whether to send traffic
 * to a new revision before flipping over.
 */
export const readinessHandler = async (_req: Request, res: Response) => {
  const [database, redis, r2] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkR2(),
  ]);

  const checks = { database, redis, r2 };
  // Required: database. Optional: redis (only required when CACHE_ENABLED),
  // r2 (only required when USE_R2). 'skipped' counts as ok.
  const overall =
    database.status === 'ok' &&
    redis.status !== 'down' &&
    r2.status !== 'down'
      ? 'ok'
      : 'degraded';

  if (overall !== 'ok') {
    logger.warn('Readiness check failed', { checks });
  }

  res.status(overall === 'ok' ? 200 : 503).json({
    status: overall,
    timestamp: new Date().toISOString(),
    checks,
  });
};
