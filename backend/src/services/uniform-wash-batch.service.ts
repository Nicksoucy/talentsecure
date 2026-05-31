/**
 * Service de gestion des lots de lavage.
 *
 * Cycle de vie d'un lot :
 *   CREATED → SENT_TO_LAUNDRY → RETURNED_FROM_LAUNDRY → INSPECTED (terminal)
 *                                                     ↘ CANCELLED (réinjection)
 *
 * Granularité par pièce : chaque UniformWashBatchItem a quantity=1, ce qui
 * permet à l'inspection post-lavage de marquer chaque pièce individuellement
 * comme GOOD / DAMAGED / LOST.
 */
import { Prisma, UniformItemCondition, WashBatchStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { applyMovement } from './uniform-stock.service';
import { notify } from './notification.service';

type Tx = Prisma.TransactionClient;

export interface CreateBatchInput {
  vendor?: string | null;
  notes?: string | null;
  createdById?: string | null;
  /** Si fourni, crée aussi les UniformWashBatchItem + applique WASH_IN. */
  items?: { variantId: string; quantity?: number; returnLineId?: string | null }[];
  /** Si appelé depuis finalizeReturn, les mouvements WASH_IN sont déjà créés
   * en transaction parente — passe `skipMovements=true` pour éviter le double. */
  skipMovements?: boolean;
}

/** Crée un nouveau lot. Si items fournis, crée aussi 1 UniformWashBatchItem qty=1
 * par UNITÉ (qty fourni = nombre de cartes physiques). */
export async function createBatch(input: CreateBatchInput) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.uniformWashBatch.create({
      data: {
        status: 'CREATED',
        vendor: input.vendor ?? null,
        notes: input.notes ?? null,
        createdById: input.createdById ?? null,
      },
    });

    if (input.items && input.items.length > 0) {
      const allItems: Prisma.UniformWashBatchItemCreateManyInput[] = [];
      for (const it of input.items) {
        const qty = it.quantity && it.quantity > 0 ? it.quantity : 1;
        for (let i = 0; i < qty; i++) {
          allItems.push({
            batchId: batch.id,
            variantId: it.variantId,
            quantity: 1, // granularité par pièce
            returnLineId: it.returnLineId ?? null,
          });
        }
        if (!input.skipMovements) {
          await applyMovement(tx, {
            variantId: it.variantId,
            type: 'WASH_IN',
            quantity: qty,
            location: 'BACK_OFFICE', // débit de mise en lavage sur la réserve
            reason: `Lot lavage ${batch.id} (manuel)`,
            createdById: input.createdById,
          });
        }
      }
      await tx.uniformWashBatchItem.createMany({ data: allItems });
    }

    return tx.uniformWashBatch.findUnique({
      where: { id: batch.id },
      include: { items: { include: { variant: { include: { item: true } } } } },
    });
  });
}

/** Ajoute des pièces à un lot existant (status=CREATED seulement). */
export async function addToBatch(
  batchId: string,
  items: { variantId: string; quantity?: number; returnLineId?: string | null }[],
  opts?: { createdById?: string | null; skipMovements?: boolean },
) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.uniformWashBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new ApiError(404, 'Lot introuvable');
    if (batch.status !== 'CREATED') {
      throw new ApiError(400, `Lot non modifiable (status=${batch.status})`);
    }

    const allItems: Prisma.UniformWashBatchItemCreateManyInput[] = [];
    for (const it of items) {
      const qty = it.quantity && it.quantity > 0 ? it.quantity : 1;
      for (let i = 0; i < qty; i++) {
        allItems.push({
          batchId,
          variantId: it.variantId,
          quantity: 1,
          returnLineId: it.returnLineId ?? null,
        });
      }
      if (!opts?.skipMovements) {
        await applyMovement(tx, {
          variantId: it.variantId,
          type: 'WASH_IN',
          quantity: qty,
          location: 'BACK_OFFICE', // débit de mise en lavage sur la réserve
          reason: `Lot lavage ${batchId} (ajout)`,
          createdById: opts?.createdById,
        });
      }
    }
    await tx.uniformWashBatchItem.createMany({ data: allItems });
    return tx.uniformWashBatch.findUnique({
      where: { id: batchId },
      include: { items: { include: { variant: { include: { item: true } } } } },
    });
  });
}

/**
 * Récupère le « lot ouvert » courant (status=CREATED), ou en crée un nouveau s'il
 * n'en existe pas. C'est ce lot qui accumule tous les retours d'agents avec items
 * « Bon ». Un seul lot ouvert peut exister à la fois.
 */
export async function getOrCreateOpenBatch(opts?: { createdById?: string | null }): Promise<{ id: string }> {
  const existing = await prisma.uniformWashBatch.findFirst({
    where: { status: 'CREATED' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return { id: existing.id };

  const created = await prisma.uniformWashBatch.create({
    data: {
      status: 'CREATED',
      notes: 'Lot ouvert — accumule les retours en attente d\'envoi au lavage',
      createdById: opts?.createdById ?? null,
    },
  });
  return { id: created.id };
}

/** CREATED → SENT_TO_LAUNDRY. Crée automatiquement un NOUVEAU lot ouvert. */
export async function markSent(batchId: string, opts?: { vendor?: string | null; notes?: string | null; createdById?: string | null }) {
  const batch = await prisma.uniformWashBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new ApiError(404, 'Lot introuvable');
  if (batch.status !== 'CREATED') throw new ApiError(400, `Transition invalide depuis ${batch.status}`);

  const updated = await prisma.uniformWashBatch.update({
    where: { id: batchId },
    data: {
      status: 'SENT_TO_LAUNDRY',
      sentAt: new Date(),
      vendor: opts?.vendor ?? batch.vendor,
      notes: opts?.notes ?? batch.notes,
    },
    include: { items: { include: { variant: { include: { item: true } } } } },
  });

  // Auto-crée un nouveau lot ouvert pour les prochains retours
  await prisma.uniformWashBatch.create({
    data: {
      status: 'CREATED',
      notes: `Lot ouvert — créé automatiquement à l'envoi du lot ${batchId}`,
      createdById: opts?.createdById ?? null,
    },
  });

  await notify({
    type: 'UNIFORM_WASH_BATCH_SENT',
    channels: ['IN_APP'],
    audience: 'ADMINS',
    title: `Lot de lavage envoyé`,
    message: `Lot envoyé à ${updated.vendor || 'fournisseur'} — ${updated.items.length} pièce(s). Nouveau lot ouvert créé.`,
    link: `/uniformes/lavage/${batchId}`,
    payload: { batchId },
  });

  return updated;
}

/**
 * Raccourci : marque toutes les pièces d'un lot revenu comme « Bon » en un seul
 * appel. Utile pour le cas normal où le fournisseur retourne le lot propre et
 * complet — évite à l'admin de cliquer sur chaque pièce.
 */
export async function inspectAllGood(batchId: string, inspectedById?: string | null) {
  const batch = await prisma.uniformWashBatch.findUnique({
    where: { id: batchId },
    include: { items: true },
  });
  if (!batch) throw new ApiError(404, 'Lot introuvable');
  if (batch.status !== 'RETURNED_FROM_LAUNDRY') {
    throw new ApiError(400, `Inspection impossible depuis status=${batch.status}`);
  }
  const inspections = batch.items.map((i) => ({ itemId: i.id, postWashCondition: 'GOOD' as const }));
  return inspectBatch(batchId, inspections, inspectedById ?? null);
}

/** SENT_TO_LAUNDRY → RETURNED_FROM_LAUNDRY */
export async function markReturned(batchId: string, opts?: { notes?: string | null }) {
  const batch = await prisma.uniformWashBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new ApiError(404, 'Lot introuvable');
  if (batch.status !== 'SENT_TO_LAUNDRY') {
    throw new ApiError(400, `Transition invalide depuis ${batch.status}`);
  }

  const updated = await prisma.uniformWashBatch.update({
    where: { id: batchId },
    data: { status: 'RETURNED_FROM_LAUNDRY', returnedAt: new Date(), notes: opts?.notes ?? batch.notes },
    include: { items: { include: { variant: { include: { item: true } } } } },
  });

  await notify({
    type: 'UNIFORM_WASH_BATCH_RETURNED',
    channels: ['IN_APP', 'EMAIL'],
    audience: 'ADMINS',
    title: `Lot de lavage revenu — inspection requise`,
    message: `${updated.items.length} pièce(s) à inspecter avant ré-intégration au stock`,
    link: `/uniformes/lavage/${batchId}`,
    payload: { batchId },
  });

  return updated;
}

/** RETURNED_FROM_LAUNDRY → INSPECTED. Applique les mouvements WASH_OUT_*. */
export async function inspectBatch(
  batchId: string,
  inspections: { itemId: string; postWashCondition: UniformItemCondition; notes?: string | null }[],
  inspectedById?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.uniformWashBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch) throw new ApiError(404, 'Lot introuvable');
    if (batch.status !== 'RETURNED_FROM_LAUNDRY') {
      throw new ApiError(400, `Inspection impossible depuis status=${batch.status}`);
    }

    let damagedCount = 0;

    for (const inspection of inspections) {
      const item = batch.items.find((i) => i.id === inspection.itemId);
      if (!item) throw new ApiError(400, `Item ${inspection.itemId} ne fait pas partie du lot`);

      if (inspection.postWashCondition === 'GOOD') {
        await applyMovement(tx, {
          variantId: item.variantId,
          type: 'WASH_OUT_GOOD',
          quantity: 1,
          location: 'FRONT_OFFICE', // pièce propre ré-intégrée au comptoir de remise
          reason: `Inspection lot ${batchId} → réintégré au stock`,
          createdById: inspectedById,
        });
      } else {
        // DAMAGED / LOST / NOT_RETURNED → poubelle interne
        await applyMovement(tx, {
          variantId: item.variantId,
          type: 'WASH_OUT_DAMAGED',
          quantity: 1,
          location: 'FRONT_OFFICE', // delta 0 (audit) — étiqueté côté comptoir
          reason: `Inspection lot ${batchId} → ${inspection.postWashCondition} (poubelle)`,
          createdById: inspectedById,
        });
        damagedCount++;
      }
      await tx.uniformWashBatchItem.update({
        where: { id: item.id },
        data: { postWashCondition: inspection.postWashCondition, notes: inspection.notes ?? null },
      });
    }

    const updated = await tx.uniformWashBatch.update({
      where: { id: batchId },
      data: { status: 'INSPECTED', inspectedAt: new Date(), inspectedById: inspectedById ?? null },
      include: { items: { include: { variant: { include: { item: true } } } } },
    });

    // Notif post-tx (hors transaction)
    setImmediate(() => {
      notify({
        type: damagedCount > 0 ? 'UNIFORM_WASH_BATCH_INSPECTED_DAMAGED' : 'UNIFORM_WASH_BATCH_INSPECTED_DAMAGED',
        channels: ['IN_APP'],
        audience: 'ADMINS',
        title: damagedCount > 0
          ? `Lot inspecté — ${damagedCount} pièce(s) à la poubelle`
          : `Lot inspecté — toutes les pièces ré-intégrées`,
        message: `Lot ${batchId} : ${inspections.length - damagedCount} sauvée(s) / ${damagedCount} perdue(s)`,
        link: `/uniformes/lavage/${batchId}`,
        payload: { batchId, damagedCount },
      }).catch(() => {});
    });

    return updated;
  });
}

/** Annule un lot (réinjecte au stock les items non encore inspectés). */
export async function cancelBatch(batchId: string, opts?: { createdById?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.uniformWashBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch) throw new ApiError(404, 'Lot introuvable');
    if (batch.status === 'INSPECTED' || batch.status === 'CANCELLED') {
      throw new ApiError(400, `Lot déjà terminal (status=${batch.status})`);
    }

    for (const item of batch.items) {
      if (item.postWashCondition !== null) continue; // déjà traité
      // Annulation = REVERSAL du WASH_IN (qui a débité le BACK_OFFICE) → on
      // recrédite le BACK_OFFICE pour garder les buckets cohérents.
      await applyMovement(tx, {
        variantId: item.variantId,
        type: 'WASH_OUT_GOOD',
        quantity: 1,
        location: 'BACK_OFFICE',
        reason: `Annulation lot ${batchId} → retour stock`,
        createdById: opts?.createdById,
      });
    }

    return tx.uniformWashBatch.update({
      where: { id: batchId },
      data: { status: 'CANCELLED' },
      include: { items: { include: { variant: { include: { item: true } } } } },
    });
  });
}

/** Liste / détail */
export async function listBatches(opts?: { status?: WashBatchStatus | WashBatchStatus[]; limit?: number }) {
  const where: Prisma.UniformWashBatchWhereInput = {};
  if (opts?.status) {
    where.status = Array.isArray(opts.status) ? { in: opts.status } : opts.status;
  }
  return prisma.uniformWashBatch.findMany({
    where,
    include: {
      items: { include: { variant: { include: { item: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: opts?.limit ?? 100,
  });
}

export async function getBatch(batchId: string) {
  const batch = await prisma.uniformWashBatch.findUnique({
    where: { id: batchId },
    include: { items: { include: { variant: { include: { item: true } } } } },
  });
  if (!batch) throw new ApiError(404, 'Lot introuvable');
  return batch;
}
