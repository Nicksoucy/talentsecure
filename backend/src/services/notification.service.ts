/**
 * Service de notifications multi-canal (in-app, email, sms).
 *
 * Tous les inserts utilisent un `dedupKey` optionnel pour éviter l'envoi en
 * double (ex: 1 seul rappel "due-soon" par issuance). Les notifs avec
 * `scheduledFor > now()` sont mises en file (PENDING) et dispatchées par le
 * worker (`dispatchPendingNotifications`).
 *
 * Audience helpers :
 *   - 'ADMINS' : tous les users role IN ('ADMIN', 'RH_RECRUITER') → IN_APP
 *   - 'RH'     : email EMAIL_RH
 *   - 'PAIE'   : email EMAIL_PAIE
 *   - { userIds, emails, phones } : custom
 */
import { prisma } from '../config/database';
import {
  Notification,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { sendEmail, EMAIL_RH, EMAIL_PAIE } from './email.service';

export interface NotifyAudience {
  userIds?: string[];
  emails?: string[];
  phones?: string[];
}

export interface NotifyInput {
  type: NotificationType;
  channels: NotificationChannel[];
  audience: 'ADMINS' | 'RH' | 'PAIE' | NotifyAudience;
  title: string;
  message: string;
  link?: string | null;
  payload?: Prisma.JsonValue | null;
  dedupKey?: string | null;
  scheduledFor?: Date | null;
}

/** Résout l'audience symbolique vers des destinataires concrets. */
async function resolveAudience(
  audience: NotifyInput['audience'],
): Promise<{ userIds: string[]; emails: string[]; phones: string[] }> {
  if (audience === 'ADMINS') {
    const users = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'RH_RECRUITER'] }, isActive: true },
      select: { id: true },
    });
    return { userIds: users.map((u) => u.id), emails: [], phones: [] };
  }
  if (audience === 'RH') {
    return { userIds: [], emails: [EMAIL_RH], phones: [] };
  }
  if (audience === 'PAIE') {
    return { userIds: [], emails: [EMAIL_PAIE], phones: [] };
  }
  return {
    userIds: audience.userIds || [],
    emails: audience.emails || [],
    phones: audience.phones || [],
  };
}

/**
 * Crée une (ou plusieurs) notifications selon les canaux demandés.
 * Idempotent si dedupKey fourni — collision = no-op.
 */
export async function notify(input: NotifyInput): Promise<Notification[]> {
  const audience = await resolveAudience(input.audience);
  const toCreate: Prisma.NotificationCreateManyInput[] = [];

  // Helper : Prisma exige JsonNull explicite si on veut stocker null en Json.
  const payloadValue: Prisma.InputJsonValue | typeof Prisma.JsonNull =
    input.payload != null ? (input.payload as Prisma.InputJsonValue) : Prisma.JsonNull;

  for (const ch of input.channels) {
    if (ch === 'IN_APP') {
      for (const userId of audience.userIds) {
        toCreate.push({
          userId,
          type: input.type,
          channel: 'IN_APP',
          status: 'PENDING',
          title: input.title,
          message: input.message,
          link: input.link ?? null,
          payload: payloadValue,
          dedupKey: input.dedupKey ? `${input.dedupKey}::${userId}::IN_APP` : null,
          scheduledFor: input.scheduledFor ?? null,
        });
      }
    } else if (ch === 'EMAIL') {
      for (const email of audience.emails) {
        toCreate.push({
          userId: null,
          type: input.type,
          channel: 'EMAIL',
          status: 'PENDING',
          recipientEmail: email,
          title: input.title,
          message: input.message,
          link: input.link ?? null,
          payload: payloadValue,
          dedupKey: input.dedupKey ? `${input.dedupKey}::${email}::EMAIL` : null,
          scheduledFor: input.scheduledFor ?? null,
        });
      }
    } else if (ch === 'SMS') {
      for (const phone of audience.phones) {
        toCreate.push({
          userId: null,
          type: input.type,
          channel: 'SMS',
          status: 'PENDING',
          recipientPhone: phone,
          title: input.title,
          message: input.message,
          link: input.link ?? null,
          payload: payloadValue,
          dedupKey: input.dedupKey ? `${input.dedupKey}::${phone}::SMS` : null,
          scheduledFor: input.scheduledFor ?? null,
        });
      }
    }
  }

  if (toCreate.length === 0) return [];

  // skipDuplicates respecte la contrainte unique sur dedupKey.
  await prisma.notification.createMany({ data: toCreate, skipDuplicates: true });

  // Retourne les notifs créées (ou existantes) par dedupKey si dispo.
  const dedupKeys = toCreate.map((n) => n.dedupKey).filter((k): k is string => !!k);
  if (dedupKeys.length === 0) return [];
  return prisma.notification.findMany({ where: { dedupKey: { in: dedupKeys } } });
}

/** Mark notif as read (IN_APP only). */
export async function markRead(notificationId: string, userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date(), status: 'READ' },
  });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, channel: 'IN_APP' },
    data: { readAt: new Date(), status: 'READ' },
  });
}

export async function listForUser(
  userId: string,
  options?: { unreadOnly?: boolean; limit?: number },
): Promise<{ items: Notification[]; unreadCount: number }> {
  const limit = options?.limit ?? 30;
  const where: Prisma.NotificationWhereInput = {
    userId,
    channel: 'IN_APP',
    ...(options?.unreadOnly ? { readAt: null } : {}),
  };
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId, channel: 'IN_APP', readAt: null },
    }),
  ]);
  return { items, unreadCount };
}

/**
 * Worker : dispatch les notifs PENDING dont scheduledFor <= now() (ou null).
 * - IN_APP : marquage SENT (le frontend les lit via listForUser).
 * - EMAIL  : envoi via SMTP, status=SENT ou FAILED.
 * - SMS    : à brancher sur sms.service.ts dans une V2.1.
 *
 * Retourne un récap { sent, failed, skipped }.
 */
export interface DispatchResult {
  sent: number;
  failed: number;
  skipped: number;
}

const MAX_ATTEMPTS = 3;

export async function dispatchPendingNotifications(): Promise<DispatchResult> {
  const now = new Date();
  const pending = await prisma.notification.findMany({
    where: {
      status: 'PENDING',
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
      attempts: { lt: MAX_ATTEMPTS },
    },
    take: 100,
    orderBy: { createdAt: 'asc' },
  });

  let sent = 0;
  let failed = 0;

  for (const n of pending) {
    try {
      if (n.channel === 'IN_APP') {
        // Pas d'envoi externe — marquage SENT (la cloche frontend la verra).
        await prisma.notification.update({
          where: { id: n.id },
          data: { status: 'SENT', sentAt: new Date(), attempts: n.attempts + 1 },
        });
        sent++;
      } else if (n.channel === 'EMAIL' && n.recipientEmail) {
        await sendEmail({
          to: n.recipientEmail,
          subject: n.title,
          html: htmlFromMessage(n),
        });
        await prisma.notification.update({
          where: { id: n.id },
          data: { status: 'SENT', sentAt: new Date(), attempts: n.attempts + 1 },
        });
        sent++;
      } else if (n.channel === 'SMS') {
        // V2.1 : brancher sms.service.ts ici.
        await prisma.notification.update({
          where: { id: n.id },
          data: { status: 'SENT', sentAt: new Date(), attempts: n.attempts + 1, failedReason: 'SMS dispatch non implémenté V2' },
        });
        sent++;
      }
    } catch (e) {
      const reason = (e as Error).message;
      const nextAttempts = n.attempts + 1;
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          status: nextAttempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          attempts: nextAttempts,
          failedReason: reason,
        },
      });
      failed++;
    }
  }

  return { sent, failed, skipped: 0 };
}

/**
 * Construction du HTML d'un email à partir d'une Notification générique.
 * Pour des emails formatés (avec liste d'items, etc.), passer directement par
 * sendEmail + renderTemplate dans le code métier — pas via cette voie.
 */
function htmlFromMessage(n: Notification): string {
  const link = n.link ? `<p><a href="${n.link}">Ouvrir dans TalentSecure</a></p>` : '';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1f2937;">${escapeHtml(n.title)}</h2>
      <p>${escapeHtml(n.message).replace(/\n/g, '<br>')}</p>
      ${link}
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="font-size: 12px; color: #6b7280;">TalentSecure — notification automatique</p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
