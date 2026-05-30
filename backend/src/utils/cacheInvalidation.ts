import { deleteCache, invalidateCacheByPrefix } from '../config/cache';

/**
 * Invalidation de cache mutualisée.
 *
 * Remplace les helpers `invalidateXxxCaches()` copiés dans chaque contrôleur :
 *  - purge une liste par préfixe (`listPrefix`),
 *  - supprime des clés de stats fixes (`statKeys`),
 *  - et optionnellement une clé de détail (`detailPrefix:detailId`).
 */
export async function invalidateCaches(opts: {
  listPrefix?: string;
  statKeys?: string[];
  detailPrefix?: string;
  detailId?: string;
}): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (opts.listPrefix) tasks.push(invalidateCacheByPrefix(opts.listPrefix));
  for (const key of opts.statKeys ?? []) tasks.push(deleteCache(key));
  if (opts.detailPrefix && opts.detailId) {
    tasks.push(deleteCache(`${opts.detailPrefix}:${opts.detailId}`));
  }
  await Promise.all(tasks);
}
