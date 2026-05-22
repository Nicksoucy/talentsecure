-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIF', 'INACTIF');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT NOT NULL DEFAULT 'QC',
    "postalCode" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIF',
    "hireDate" TIMESTAMP(3),
    "employeeNumber" TEXT,
    "position" TEXT,
    "assignment" TEXT,
    "hasBSP" BOOLEAN NOT NULL DEFAULT false,
    "bspNumber" TEXT,
    "bspExpiryDate" TIMESTAMP(3),
    "hasVehicle" BOOLEAN NOT NULL DEFAULT false,
    "cvUrl" TEXT,
    "cvStoragePath" TEXT,
    "videoUrl" TEXT,
    "videoStoragePath" TEXT,
    "notes" TEXT,
    "convertedFromCandidateId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_email_idx" ON "employees"("email");
CREATE INDEX "employees_phone_idx" ON "employees"("phone");
CREATE INDEX "employees_status_idx" ON "employees"("status");
CREATE INDEX "employees_isDeleted_idx" ON "employees"("isDeleted");
CREATE INDEX "employees_lastName_idx" ON "employees"("lastName");
CREATE INDEX "employees_city_idx" ON "employees"("city");
CREATE INDEX "employees_convertedFromCandidateId_idx" ON "employees"("convertedFromCandidateId");
