-- ===========================================================================
-- Module UNIFORMES — prêt/retour d'uniformes & équipements aux agents.
-- Migration MANUELLE (prod Neon) : appliquer via
--   npx prisma db execute --file ./prisma/migrations/20260525000000_add_uniform_management/migration.sql --schema ./prisma/schema.prisma
-- puis `npx prisma generate`. NE PAS utiliser `prisma migrate deploy`.
-- N'altère NI la table "employees" NI l'enum "UserRole".
-- ===========================================================================

-- CreateEnum
CREATE TYPE "UniformDivision" AS ENUM ('SECURITE', 'SIGNALISATION');
CREATE TYPE "UniformPieceType" AS ENUM ('UNIFORME', 'EQUIPEMENT');
CREATE TYPE "UniformMovementType" AS ENUM ('IN', 'OUT', 'ADJUST', 'LOST', 'DAMAGED');
CREATE TYPE "UniformItemCondition" AS ENUM ('GOOD', 'DAMAGED', 'LOST', 'NOT_RETURNED');
CREATE TYPE "UniformIssuanceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_RETURNED', 'RETURNED', 'CLOSED_TERMINATION', 'CANCELLED');
CREATE TYPE "UniformSignatureStatus" AS ENUM ('PENDING', 'SENT', 'SIGNED', 'SKIPPED');
CREATE TYPE "UniformSignatureMethod" AS ENUM ('REMOTE_SMS', 'COUNTER');

-- CreateTable
CREATE TABLE "uniform_items" (
    "id" TEXT NOT NULL,
    "division" "UniformDivision" NOT NULL,
    "type" "UniformPieceType" NOT NULL DEFAULT 'UNIFORME',
    "name" TEXT NOT NULL,
    "isOneSize" BOOLEAN NOT NULL DEFAULT false,
    "defaultReplacementCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uniform_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_variants" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "size" TEXT NOT NULL DEFAULT 'Unique',
    "sku" TEXT,
    "barcode" TEXT NOT NULL,
    "replacementCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "reorderThreshold" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uniform_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_stock_movements" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "type" "UniformMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "issuanceId" TEXT,
    "returnId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uniform_stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_issuances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "division" "UniformDivision" NOT NULL,
    "status" "UniformIssuanceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3),
    "dueReturnAt" TIMESTAMP(3),
    "totalLoanCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payrollConsentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "uniformPolicyConsentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "fitAttested" BOOLEAN NOT NULL DEFAULT false,
    "employeeSignatureStoragePath" TEXT,
    "employerSignatureStoragePath" TEXT,
    "signatureStatus" "UniformSignatureStatus" NOT NULL DEFAULT 'PENDING',
    "signatureMethod" "UniformSignatureMethod",
    "signedAt" TIMESTAMP(3),
    "signedByName" TEXT,
    "signToken" TEXT,
    "signTokenExpiresAt" TIMESTAMP(3),
    "smsSentAt" TIMESTAMP(3),
    "ghlMessageId" TEXT,
    "formPdfStoragePath" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uniform_issuances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_issuance_lines" (
    "id" TEXT NOT NULL,
    "issuanceId" TEXT NOT NULL,
    "variantId" TEXT,
    "customItemName" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitCostSnapshot" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "uniform_issuance_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_returns" (
    "id" TEXT NOT NULL,
    "issuanceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "UniformIssuanceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "returnedAt" TIMESTAMP(3),
    "employeeSignatureStoragePath" TEXT,
    "employerSignatureStoragePath" TEXT,
    "signatureStatus" "UniformSignatureStatus" NOT NULL DEFAULT 'PENDING',
    "signatureMethod" "UniformSignatureMethod",
    "signedAt" TIMESTAMP(3),
    "signedByName" TEXT,
    "signToken" TEXT,
    "signTokenExpiresAt" TIMESTAMP(3),
    "smsSentAt" TIMESTAMP(3),
    "ghlMessageId" TEXT,
    "formPdfStoragePath" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uniform_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_return_lines" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "variantId" TEXT,
    "customItemName" TEXT,
    "quantity" INTEGER NOT NULL,
    "condition" "UniformItemCondition" NOT NULL DEFAULT 'GOOD',
    "unitReplacementCost" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "uniform_return_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_debt_settlements" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uniform_debt_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniform_items_division_name_key" ON "uniform_items"("division", "name");
CREATE INDEX "uniform_items_division_idx" ON "uniform_items"("division");
CREATE INDEX "uniform_items_type_idx" ON "uniform_items"("type");
CREATE INDEX "uniform_items_isActive_idx" ON "uniform_items"("isActive");

CREATE UNIQUE INDEX "uniform_variants_barcode_key" ON "uniform_variants"("barcode");
CREATE UNIQUE INDEX "uniform_variants_itemId_size_key" ON "uniform_variants"("itemId", "size");
CREATE INDEX "uniform_variants_itemId_idx" ON "uniform_variants"("itemId");
CREATE INDEX "uniform_variants_barcode_idx" ON "uniform_variants"("barcode");
CREATE INDEX "uniform_variants_isActive_idx" ON "uniform_variants"("isActive");

CREATE INDEX "uniform_stock_movements_variantId_idx" ON "uniform_stock_movements"("variantId");
CREATE INDEX "uniform_stock_movements_type_idx" ON "uniform_stock_movements"("type");
CREATE INDEX "uniform_stock_movements_issuanceId_idx" ON "uniform_stock_movements"("issuanceId");
CREATE INDEX "uniform_stock_movements_returnId_idx" ON "uniform_stock_movements"("returnId");
CREATE INDEX "uniform_stock_movements_createdAt_idx" ON "uniform_stock_movements"("createdAt");

CREATE UNIQUE INDEX "uniform_issuances_signToken_key" ON "uniform_issuances"("signToken");
CREATE INDEX "uniform_issuances_employeeId_idx" ON "uniform_issuances"("employeeId");
CREATE INDEX "uniform_issuances_division_idx" ON "uniform_issuances"("division");
CREATE INDEX "uniform_issuances_status_idx" ON "uniform_issuances"("status");
CREATE INDEX "uniform_issuances_signToken_idx" ON "uniform_issuances"("signToken");
CREATE INDEX "uniform_issuances_dueReturnAt_idx" ON "uniform_issuances"("dueReturnAt");
CREATE INDEX "uniform_issuances_createdAt_idx" ON "uniform_issuances"("createdAt");

CREATE INDEX "uniform_issuance_lines_issuanceId_idx" ON "uniform_issuance_lines"("issuanceId");
CREATE INDEX "uniform_issuance_lines_variantId_idx" ON "uniform_issuance_lines"("variantId");

CREATE UNIQUE INDEX "uniform_returns_signToken_key" ON "uniform_returns"("signToken");
CREATE INDEX "uniform_returns_issuanceId_idx" ON "uniform_returns"("issuanceId");
CREATE INDEX "uniform_returns_employeeId_idx" ON "uniform_returns"("employeeId");
CREATE INDEX "uniform_returns_signToken_idx" ON "uniform_returns"("signToken");
CREATE INDEX "uniform_returns_createdAt_idx" ON "uniform_returns"("createdAt");

CREATE INDEX "uniform_return_lines_returnId_idx" ON "uniform_return_lines"("returnId");
CREATE INDEX "uniform_return_lines_variantId_idx" ON "uniform_return_lines"("variantId");
CREATE INDEX "uniform_return_lines_condition_idx" ON "uniform_return_lines"("condition");

CREATE INDEX "uniform_debt_settlements_employeeId_idx" ON "uniform_debt_settlements"("employeeId");

-- AddForeignKey (entre nouvelles tables uniquement — n'altère pas employees)
ALTER TABLE "uniform_variants" ADD CONSTRAINT "uniform_variants_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "uniform_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_stock_movements" ADD CONSTRAINT "uniform_stock_movements_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "uniform_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_issuance_lines" ADD CONSTRAINT "uniform_issuance_lines_issuanceId_fkey" FOREIGN KEY ("issuanceId") REFERENCES "uniform_issuances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_issuance_lines" ADD CONSTRAINT "uniform_issuance_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "uniform_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "uniform_returns" ADD CONSTRAINT "uniform_returns_issuanceId_fkey" FOREIGN KEY ("issuanceId") REFERENCES "uniform_issuances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_return_lines" ADD CONSTRAINT "uniform_return_lines_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "uniform_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_return_lines" ADD CONSTRAINT "uniform_return_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "uniform_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
