-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'RH_RECRUITER', 'SALES', 'CLIENT');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('QUALIFIE', 'BON', 'TRES_BON', 'EXCELLENT', 'ELITE', 'A_REVOIR', 'EN_ATTENTE', 'INACTIF', 'ABSENT');

-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('JOUR', 'SOIR', 'NUIT', 'FIN_DE_SEMAINE');

-- CreateEnum
CREATE TYPE "LanguageLevel" AS ENUM ('DEBUTANT', 'INTERMEDIAIRE', 'AVANCE', 'BILINGUE', 'LANGUE_MATERNELLE');

-- CreateEnum
CREATE TYPE "CatalogueStatus" AS ENUM ('BROUILLON', 'GENERE', 'ENVOYE', 'ACCEPTE', 'REFUSE');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('EN_NEGOCIATION', 'CONFIRME', 'EN_COURS', 'TERMINE', 'ANNULE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT');

-- CreateEnum
CREATE TYPE "CatalogueSelectionStatus" AS ENUM ('INTERESSE', 'DEMANDE', 'ACCEPTE', 'PLACE', 'REFUSE', 'ANNULE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CandidateType" AS ENUM ('EVALUATED', 'CV_ONLY');

-- CreateEnum
CREATE TYPE "WishlistStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('TECHNICAL', 'SOFT_SKILL', 'CERTIFICATION', 'LANGUAGE', 'INDUSTRY', 'TOOL_EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SkillSource" AS ENUM ('REGEX_EXTRACTED', 'AI_EXTRACTED', 'MANUAL_ENTRY', 'HUMAN_VERIFIED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'RH_RECRUITER',
    "googleId" TEXT,
    "microsoftId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL DEFAULT 'QC',
    "postalCode" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "globalRating" DOUBLE PRECISION,
    "interviewDate" TIMESTAMP(3),
    "professionalismRating" DOUBLE PRECISION,
    "communicationRating" DOUBLE PRECISION,
    "appearanceRating" DOUBLE PRECISION,
    "motivationRating" DOUBLE PRECISION,
    "experienceRating" DOUBLE PRECISION,
    "hrNotes" TEXT,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "interviewDetails" JSONB,
    "hasVehicle" BOOLEAN NOT NULL DEFAULT false,
    "canTravelKm" INTEGER,
    "hasBSP" BOOLEAN NOT NULL DEFAULT false,
    "bspNumber" TEXT,
    "bspExpiryDate" TIMESTAMP(3),
    "bspStatus" TEXT,
    "hasDriverLicense" BOOLEAN NOT NULL DEFAULT false,
    "driverLicenseNumber" TEXT,
    "driverLicenseClass" TEXT,
    "vehicleType" TEXT,
    "available24_7" BOOLEAN NOT NULL DEFAULT false,
    "availableDays" BOOLEAN NOT NULL DEFAULT false,
    "availableNights" BOOLEAN NOT NULL DEFAULT false,
    "availableWeekends" BOOLEAN NOT NULL DEFAULT false,
    "availableImmediately" BOOLEAN NOT NULL DEFAULT true,
    "preferredShiftType" TEXT,
    "willingToRelocate" BOOLEAN NOT NULL DEFAULT false,
    "maxCommuteMins" INTEGER,
    "hasRCR" BOOLEAN NOT NULL DEFAULT false,
    "rcrExpiryDate" TIMESTAMP(3),
    "hasSSIAP" BOOLEAN NOT NULL DEFAULT false,
    "ssiapExpiryDate" TIMESTAMP(3),
    "urgency24hScore" INTEGER DEFAULT 0,
    "canWorkUrgent" BOOLEAN NOT NULL DEFAULT false,
    "videoUrl" TEXT,
    "videoUploadedAt" TIMESTAMP(3),
    "videoStoragePath" TEXT,
    "cvUrl" TEXT,
    "cvStoragePath" TEXT,
    "documentsUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentDate" TIMESTAMP(3),
    "consentSignature" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availabilities" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "type" "AvailabilityType" NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" "LanguageLevel" NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canWrite" BOOLEAN NOT NULL DEFAULT true,
    "canSpeak" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "durationMonths" INTEGER,
    "description" TEXT,
    "responsibilities" TEXT,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuingOrg" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "certificateUrl" TEXT,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "situation_tests" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "evaluatorNotes" TEXT,

    CONSTRAINT "situation_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "billingEmail" TEXT,
    "defaultPricePerCandidate" DECIMAL(10,2),
    "discountPercent" DOUBLE PRECISION,
    "paymentTerms" TEXT,
    "taxNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_interactions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogues" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customMessage" TEXT,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'BROUILLON',
    "includeSummary" BOOLEAN NOT NULL DEFAULT true,
    "includeDetails" BOOLEAN NOT NULL DEFAULT true,
    "includeVideo" BOOLEAN NOT NULL DEFAULT true,
    "includeExperience" BOOLEAN NOT NULL DEFAULT true,
    "includeSituation" BOOLEAN NOT NULL DEFAULT true,
    "includeCV" BOOLEAN NOT NULL DEFAULT true,
    "pdfUrl" TEXT,
    "pdfStoragePath" TEXT,
    "shareToken" TEXT,
    "shareTokenExpiresAt" TIMESTAMP(3),
    "requiresPayment" BOOLEAN NOT NULL DEFAULT false,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paymentAmount" DECIMAL(10,2),
    "paymentReference" TEXT,
    "generatedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_items" (
    "id" TEXT NOT NULL,
    "catalogueId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalogue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placements" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'EN_NEGOCIATION',
    "position" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "hourlyRate" DOUBLE PRECISION,
    "commissionRate" DOUBLE PRECISION,
    "commissionAmount" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_candidates" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "streetAddress" TEXT,
    "city" TEXT,
    "province" TEXT DEFAULT 'QC',
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'CA',
    "fullAddress" TEXT,
    "cvUrl" TEXT,
    "cvStoragePath" TEXT,
    "timezone" TEXT,
    "submissionDate" TIMESTAMP(3),
    "isContacted" BOOLEAN NOT NULL DEFAULT false,
    "contactedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "convertedAt" TIMESTAMP(3),
    "convertedToId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospect_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_selections" (
    "id" TEXT NOT NULL,
    "catalogueId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "CatalogueSelectionStatus" NOT NULL DEFAULT 'INTERESSE',
    "quantity" INTEGER,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "pricePerPerson" DECIMAL(10,2),
    "totalAmount" DECIMAL(10,2),
    "notes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "respondedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogue_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_payments" (
    "id" TEXT NOT NULL,
    "catalogueId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "invoiceNumber" TEXT,
    "invoiceUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "subtotal" DECIMAL(10,2),
    "taxAmount" DECIMAL(10,2),
    "taxRate" DOUBLE PRECISION,
    "notes" TEXT,
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogue_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city_pricing" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL DEFAULT 'QC',
    "evaluatedCandidateMinPrice" DECIMAL(10,2) NOT NULL DEFAULT 15,
    "evaluatedCandidateMaxPrice" DECIMAL(10,2) NOT NULL DEFAULT 45,
    "evaluatedCandidatePrice" DECIMAL(10,2) NOT NULL DEFAULT 30,
    "cvOnlyMinPrice" DECIMAL(10,2) NOT NULL DEFAULT 5,
    "cvOnlyMaxPrice" DECIMAL(10,2) NOT NULL DEFAULT 10,
    "cvOnlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 7.50,
    "priceMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_wishlists" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "WishlistStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "wishlistId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL DEFAULT 'QC',
    "type" "CandidateType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_purchases" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "CandidateType" NOT NULL,
    "candidateId" TEXT,
    "prospectId" TEXT,
    "city" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "catalogueId" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL,
    "description" TEXT,
    "keywords" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSecurityRelated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_skills" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" "SkillLevel" NOT NULL DEFAULT 'UNKNOWN',
    "source" "SkillSource" NOT NULL DEFAULT 'MANUAL_ENTRY',
    "yearsExperience" INTEGER,
    "extractedText" TEXT,
    "confidence" DOUBLE PRECISION,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_skills" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" "SkillLevel" NOT NULL DEFAULT 'UNKNOWN',
    "source" "SkillSource" NOT NULL DEFAULT 'MANUAL_ENTRY',
    "yearsExperience" INTEGER,
    "extractedText" TEXT,
    "confidence" DOUBLE PRECISION,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospect_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_extraction_logs" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "extractionMethod" TEXT NOT NULL,
    "skillsFound" INTEGER NOT NULL DEFAULT 0,
    "processingTimeMs" INTEGER,
    "aiModel" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalCost" DOUBLE PRECISION,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "rawResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_extraction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_microsoftId_key" ON "users"("microsoftId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "candidates_status_idx" ON "candidates"("status");

-- CreateIndex
CREATE INDEX "candidates_globalRating_idx" ON "candidates"("globalRating");

-- CreateIndex
CREATE INDEX "candidates_city_idx" ON "candidates"("city");

-- CreateIndex
CREATE INDEX "candidates_hasBSP_idx" ON "candidates"("hasBSP");

-- CreateIndex
CREATE INDEX "candidates_hasVehicle_idx" ON "candidates"("hasVehicle");

-- CreateIndex
CREATE INDEX "candidates_isActive_idx" ON "candidates"("isActive");

-- CreateIndex
CREATE INDEX "candidates_isArchived_idx" ON "candidates"("isArchived");

-- CreateIndex
CREATE INDEX "candidates_isDeleted_idx" ON "candidates"("isDeleted");

-- CreateIndex
CREATE INDEX "candidates_interviewDate_idx" ON "candidates"("interviewDate");

-- CreateIndex
CREATE INDEX "candidates_createdAt_idx" ON "candidates"("createdAt");

-- CreateIndex
CREATE INDEX "candidates_isDeleted_isActive_isArchived_idx" ON "candidates"("isDeleted", "isActive", "isArchived");

-- CreateIndex
CREATE INDEX "candidates_city_status_idx" ON "candidates"("city", "status");

-- CreateIndex
CREATE INDEX "candidates_status_globalRating_idx" ON "candidates"("status", "globalRating");

-- CreateIndex
CREATE INDEX "candidates_firstName_idx" ON "candidates"("firstName");

-- CreateIndex
CREATE INDEX "candidates_lastName_idx" ON "candidates"("lastName");

-- CreateIndex
CREATE INDEX "candidates_email_idx" ON "candidates"("email");

-- CreateIndex
CREATE INDEX "candidates_available24_7_idx" ON "candidates"("available24_7");

-- CreateIndex
CREATE INDEX "candidates_hasRCR_idx" ON "candidates"("hasRCR");

-- CreateIndex
CREATE INDEX "candidates_city_hasBSP_available24_7_idx" ON "candidates"("city", "hasBSP", "available24_7");

-- CreateIndex
CREATE INDEX "candidates_globalRating_available24_7_idx" ON "candidates"("globalRating", "available24_7");

-- CreateIndex
CREATE INDEX "availabilities_candidateId_idx" ON "availabilities"("candidateId");

-- CreateIndex
CREATE INDEX "languages_candidateId_idx" ON "languages"("candidateId");

-- CreateIndex
CREATE INDEX "languages_language_idx" ON "languages"("language");

-- CreateIndex
CREATE INDEX "experiences_candidateId_idx" ON "experiences"("candidateId");

-- CreateIndex
CREATE INDEX "certifications_candidateId_idx" ON "certifications"("candidateId");

-- CreateIndex
CREATE INDEX "situation_tests_candidateId_idx" ON "situation_tests"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_email_key" ON "clients"("email");

-- CreateIndex
CREATE INDEX "clients_email_idx" ON "clients"("email");

-- CreateIndex
CREATE INDEX "clients_companyName_idx" ON "clients"("companyName");

-- CreateIndex
CREATE INDEX "client_contacts_clientId_idx" ON "client_contacts"("clientId");

-- CreateIndex
CREATE INDEX "client_contacts_email_idx" ON "client_contacts"("email");

-- CreateIndex
CREATE INDEX "client_interactions_clientId_idx" ON "client_interactions"("clientId");

-- CreateIndex
CREATE INDEX "client_interactions_type_idx" ON "client_interactions"("type");

-- CreateIndex
CREATE INDEX "client_interactions_createdAt_idx" ON "client_interactions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "catalogues_shareToken_key" ON "catalogues"("shareToken");

-- CreateIndex
CREATE INDEX "catalogues_clientId_idx" ON "catalogues"("clientId");

-- CreateIndex
CREATE INDEX "catalogues_status_idx" ON "catalogues"("status");

-- CreateIndex
CREATE INDEX "catalogues_createdAt_idx" ON "catalogues"("createdAt");

-- CreateIndex
CREATE INDEX "catalogues_shareToken_idx" ON "catalogues"("shareToken");

-- CreateIndex
CREATE INDEX "catalogue_items_catalogueId_idx" ON "catalogue_items"("catalogueId");

-- CreateIndex
CREATE INDEX "catalogue_items_candidateId_idx" ON "catalogue_items"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "catalogue_items_catalogueId_candidateId_key" ON "catalogue_items"("catalogueId", "candidateId");

-- CreateIndex
CREATE INDEX "placements_clientId_idx" ON "placements"("clientId");

-- CreateIndex
CREATE INDEX "placements_candidateId_idx" ON "placements"("candidateId");

-- CreateIndex
CREATE INDEX "placements_status_idx" ON "placements"("status");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "prospect_candidates_email_idx" ON "prospect_candidates"("email");

-- CreateIndex
CREATE INDEX "prospect_candidates_phone_idx" ON "prospect_candidates"("phone");

-- CreateIndex
CREATE INDEX "prospect_candidates_city_idx" ON "prospect_candidates"("city");

-- CreateIndex
CREATE INDEX "prospect_candidates_isContacted_idx" ON "prospect_candidates"("isContacted");

-- CreateIndex
CREATE INDEX "prospect_candidates_isConverted_idx" ON "prospect_candidates"("isConverted");

-- CreateIndex
CREATE INDEX "prospect_candidates_submissionDate_idx" ON "prospect_candidates"("submissionDate");

-- CreateIndex
CREATE INDEX "prospect_candidates_createdAt_idx" ON "prospect_candidates"("createdAt");

-- CreateIndex
CREATE INDEX "catalogue_selections_catalogueId_idx" ON "catalogue_selections"("catalogueId");

-- CreateIndex
CREATE INDEX "catalogue_selections_candidateId_idx" ON "catalogue_selections"("candidateId");

-- CreateIndex
CREATE INDEX "catalogue_selections_clientId_idx" ON "catalogue_selections"("clientId");

-- CreateIndex
CREATE INDEX "catalogue_selections_status_idx" ON "catalogue_selections"("status");

-- CreateIndex
CREATE INDEX "catalogue_selections_requestedAt_idx" ON "catalogue_selections"("requestedAt");

-- CreateIndex
CREATE INDEX "catalogue_payments_catalogueId_idx" ON "catalogue_payments"("catalogueId");

-- CreateIndex
CREATE INDEX "catalogue_payments_clientId_idx" ON "catalogue_payments"("clientId");

-- CreateIndex
CREATE INDEX "catalogue_payments_status_idx" ON "catalogue_payments"("status");

-- CreateIndex
CREATE INDEX "catalogue_payments_paidAt_idx" ON "catalogue_payments"("paidAt");

-- CreateIndex
CREATE INDEX "catalogue_payments_invoiceNumber_idx" ON "catalogue_payments"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "city_pricing_city_key" ON "city_pricing"("city");

-- CreateIndex
CREATE INDEX "city_pricing_city_idx" ON "city_pricing"("city");

-- CreateIndex
CREATE INDEX "city_pricing_province_idx" ON "city_pricing"("province");

-- CreateIndex
CREATE INDEX "client_wishlists_clientId_idx" ON "client_wishlists"("clientId");

-- CreateIndex
CREATE INDEX "client_wishlists_status_idx" ON "client_wishlists"("status");

-- CreateIndex
CREATE INDEX "wishlist_items_wishlistId_idx" ON "wishlist_items"("wishlistId");

-- CreateIndex
CREATE INDEX "wishlist_items_city_idx" ON "wishlist_items"("city");

-- CreateIndex
CREATE INDEX "client_purchases_clientId_idx" ON "client_purchases"("clientId");

-- CreateIndex
CREATE INDEX "client_purchases_candidateId_idx" ON "client_purchases"("candidateId");

-- CreateIndex
CREATE INDEX "client_purchases_prospectId_idx" ON "client_purchases"("prospectId");

-- CreateIndex
CREATE INDEX "client_purchases_city_idx" ON "client_purchases"("city");

-- CreateIndex
CREATE INDEX "client_purchases_purchasedAt_idx" ON "client_purchases"("purchasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "client_purchases_clientId_candidateId_key" ON "client_purchases"("clientId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "client_purchases_clientId_prospectId_key" ON "client_purchases"("clientId", "prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE INDEX "skills_category_idx" ON "skills"("category");

-- CreateIndex
CREATE INDEX "skills_name_idx" ON "skills"("name");

-- CreateIndex
CREATE INDEX "skills_isActive_idx" ON "skills"("isActive");

-- CreateIndex
CREATE INDEX "skills_isSecurityRelated_idx" ON "skills"("isSecurityRelated");

-- CreateIndex
CREATE INDEX "candidate_skills_candidateId_idx" ON "candidate_skills"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_skills_skillId_idx" ON "candidate_skills"("skillId");

-- CreateIndex
CREATE INDEX "candidate_skills_level_idx" ON "candidate_skills"("level");

-- CreateIndex
CREATE INDEX "candidate_skills_source_idx" ON "candidate_skills"("source");

-- CreateIndex
CREATE INDEX "candidate_skills_isVerified_idx" ON "candidate_skills"("isVerified");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_skills_candidateId_skillId_key" ON "candidate_skills"("candidateId", "skillId");

-- CreateIndex
CREATE INDEX "prospect_skills_prospectId_idx" ON "prospect_skills"("prospectId");

-- CreateIndex
CREATE INDEX "prospect_skills_skillId_idx" ON "prospect_skills"("skillId");

-- CreateIndex
CREATE INDEX "prospect_skills_level_idx" ON "prospect_skills"("level");

-- CreateIndex
CREATE INDEX "prospect_skills_source_idx" ON "prospect_skills"("source");

-- CreateIndex
CREATE INDEX "prospect_skills_isVerified_idx" ON "prospect_skills"("isVerified");

-- CreateIndex
CREATE UNIQUE INDEX "prospect_skills_prospectId_skillId_key" ON "prospect_skills"("prospectId", "skillId");

-- CreateIndex
CREATE INDEX "cv_extraction_logs_candidateId_idx" ON "cv_extraction_logs"("candidateId");

-- CreateIndex
CREATE INDEX "cv_extraction_logs_extractionMethod_idx" ON "cv_extraction_logs"("extractionMethod");

-- CreateIndex
CREATE INDEX "cv_extraction_logs_success_idx" ON "cv_extraction_logs"("success");

-- CreateIndex
CREATE INDEX "cv_extraction_logs_createdAt_idx" ON "cv_extraction_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "situation_tests" ADD CONSTRAINT "situation_tests_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_interactions" ADD CONSTRAINT "client_interactions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_interactions" ADD CONSTRAINT "client_interactions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogues" ADD CONSTRAINT "catalogues_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogues" ADD CONSTRAINT "catalogues_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_items" ADD CONSTRAINT "catalogue_items_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "catalogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_items" ADD CONSTRAINT "catalogue_items_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_selections" ADD CONSTRAINT "catalogue_selections_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "catalogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_selections" ADD CONSTRAINT "catalogue_selections_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_selections" ADD CONSTRAINT "catalogue_selections_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_selections" ADD CONSTRAINT "catalogue_selections_respondedBy_fkey" FOREIGN KEY ("respondedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_payments" ADD CONSTRAINT "catalogue_payments_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "catalogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_payments" ADD CONSTRAINT "catalogue_payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_payments" ADD CONSTRAINT "catalogue_payments_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_wishlists" ADD CONSTRAINT "client_wishlists_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "client_wishlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchases" ADD CONSTRAINT "client_purchases_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchases" ADD CONSTRAINT "client_purchases_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchases" ADD CONSTRAINT "client_purchases_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospect_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_purchases" ADD CONSTRAINT "client_purchases_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "catalogues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_skills" ADD CONSTRAINT "prospect_skills_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospect_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_skills" ADD CONSTRAINT "prospect_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

