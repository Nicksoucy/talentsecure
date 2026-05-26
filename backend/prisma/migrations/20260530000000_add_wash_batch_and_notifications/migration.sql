-- ===========================================================================
-- Module UNIFORMES V2 — cycle de lavage, rebut, et notifications in-app/email.
-- Migration MANUELLE (prod Neon) : appliquer via
--   npx prisma db execute --file ./prisma/migrations/20260530000000_add_wash_batch_and_notifications/migration.sql --schema ./prisma/schema.prisma
-- puis `npx prisma generate`. NE PAS utiliser `prisma migrate deploy`.
-- Aucun ALTER sur "users" ni "employees".
-- ===========================================================================

-- Étendre l'enum existant UniformMovementType ---------------------------------
ALTER TYPE "UniformMovementType" ADD VALUE IF NOT EXISTS 'WASH_IN';
ALTER TYPE "UniformMovementType" ADD VALUE IF NOT EXISTS 'WASH_OUT_GOOD';
ALTER TYPE "UniformMovementType" ADD VALUE IF NOT EXISTS 'WASH_OUT_DAMAGED';
ALTER TYPE "UniformMovementType" ADD VALUE IF NOT EXISTS 'DISPOSAL';

-- Nouveaux enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "WashBatchStatus" AS ENUM ('CREATED', 'SENT_TO_LAUNDRY', 'RETURNED_FROM_LAUNDRY', 'INSPECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'UNIFORM_RETURN_DAMAGED',
    'UNIFORM_WASH_BATCH_CREATED',
    'UNIFORM_WASH_BATCH_SENT',
    'UNIFORM_WASH_BATCH_RETURNED',
    'UNIFORM_WASH_BATCH_INSPECTED_DAMAGED',
    'UNIFORM_WASH_BATCH_STAGNANT',
    'UNIFORM_RETURN_DUE_SOON',
    'UNIFORM_RETURN_OVERDUE',
    'UNIFORM_TERMINATION_CLOSED',
    'UNIFORM_SETTLEMENT_RECORDED',
    'UNIFORM_DEBT_AGING',
    'UNIFORM_LOW_STOCK',
    'UNIFORM_STOCK_ZERO',
    'UNIFORM_LEDGER_DRIFT',
    'UNIFORM_SIGNATURE_EXPIRING',
    'UNIFORM_SIGNATURE_EXPIRED',
    'UNIFORM_EMPLOYER_SIGN_PENDING',
    'UNIFORM_BARCODE_UNKNOWN',
    'UNIFORM_INACTIVE_VARIANT_HAS_STOCK',
    'UNIFORM_DUPLICATE_ACTIVE_ISSUANCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tables wash batch -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "uniform_wash_batches" (
    "id" TEXT NOT NULL,
    "status" "WashBatchStatus" NOT NULL DEFAULT 'CREATED',
    "vendor" TEXT,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "inspectedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "inspectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "uniform_wash_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "uniform_wash_batches_status_idx" ON "uniform_wash_batches" ("status");
CREATE INDEX IF NOT EXISTS "uniform_wash_batches_createdAt_idx" ON "uniform_wash_batches" ("createdAt");

CREATE TABLE IF NOT EXISTS "uniform_wash_batch_items" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "returnLineId" TEXT,
    "postWashCondition" "UniformItemCondition",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "uniform_wash_batch_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uniform_wash_batch_items_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "uniform_wash_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "uniform_wash_batch_items_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "uniform_variants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "uniform_wash_batch_items_returnLineId_fkey"
      FOREIGN KEY ("returnLineId") REFERENCES "uniform_return_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "uniform_wash_batch_items_batchId_idx" ON "uniform_wash_batch_items" ("batchId");
CREATE INDEX IF NOT EXISTS "uniform_wash_batch_items_variantId_idx" ON "uniform_wash_batch_items" ("variantId");
CREATE INDEX IF NOT EXISTS "uniform_wash_batch_items_returnLineId_idx" ON "uniform_wash_batch_items" ("returnLineId");

-- Table notifications ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "payload" JSONB,
    "dedupKey" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupKey_key" ON "notifications" ("dedupKey");
CREATE INDEX IF NOT EXISTS "notifications_userId_readAt_idx" ON "notifications" ("userId", "readAt");
CREATE INDEX IF NOT EXISTS "notifications_status_scheduledFor_idx" ON "notifications" ("status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "notifications_channel_status_idx" ON "notifications" ("channel", "status");
CREATE INDEX IF NOT EXISTS "notifications_createdAt_idx" ON "notifications" ("createdAt");
