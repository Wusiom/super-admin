-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('WEB', 'EPUB', 'PDF');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "ParsingStage" AS ENUM ('PENDING', 'VALIDATED', 'EXTRACTED', 'ANCHORED', 'MAPPED', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ParsingQuality" AS ENUM ('GOOD', 'LOW_CONFIDENCE', 'SCANNED_UNSUPPORTED');

-- CreateEnum
CREATE TYPE "SourceAnchorKind" AS ENUM ('SECTION', 'PAGE', 'PARAGRAPH', 'RANGE');

-- CreateEnum
CREATE TYPE "ConceptImportance" AS ENUM ('CORE', 'SUPPORTING', 'DETAIL');

-- CreateEnum
CREATE TYPE "MapItemStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LearningProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "LearningContractStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TutoringSessionStatus" AS ENUM ('ACTIVE', 'INTERRUPTED', 'COMPLETED', 'ENDED', 'ERROR');

-- CreateEnum
CREATE TYPE "TutoringTurnStatus" AS ENUM ('PENDING', 'GENERATING', 'AWAITING_USER', 'EVALUATED', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "TutorActionKind" AS ENUM ('EXPLAIN', 'ASK_RECALL', 'ASK_SELF_EXPLAIN', 'ASK_TRANSFER', 'GIVE_HINT', 'GIVE_EXAMPLE', 'COMPARE', 'CHALLENGE', 'SUMMARIZE', 'MAKE_NOTE');

-- CreateEnum
CREATE TYPE "EvaluationOutcome" AS ENUM ('UNSUPPORTED', 'PARTIAL', 'SOUND', 'TRANSFER_VALIDATED');

-- CreateEnum
CREATE TYPE "UnderstandingLevel" AS ENUM ('UNSEEN', 'RECALLABLE', 'EXPLAINABLE', 'TRANSFER_VALIDATED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('RECALL', 'EXPLANATION', 'BOUNDARY', 'TRANSFER', 'DISAGREEMENT');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NoteLinkStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ModelConfigStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "PromptKind" AS ENUM ('ACTION', 'EVALUATION', 'NOTE');

-- CreateEnum
CREATE TYPE "ModelCallStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "QuotaMetric" AS ENUM ('MODEL_TOKENS', 'STORAGE_BYTES', 'FILE_SIZE_BYTES', 'CONCURRENT_SESSIONS');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddressHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "WebSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" SERIAL NOT NULL,
    "actorUserId" INTEGER,
    "targetUserId" INTEGER,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "beforeMetadata" JSONB,
    "afterMetadata" JSONB,
    "result" "AuditResult" NOT NULL,
    "errorCategory" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "toolKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" TEXT,
    "output" TEXT,
    "error" TEXT,
    "inputMetadata" JSONB,
    "outputMetadata" JSONB,
    "errorCategory" TEXT,
    "retryEligible" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "bullmqJobId" TEXT,
    "idempotencyKey" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT,
    "contentHtml" TEXT,
    "contentMarkdown" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningSource" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "SourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'PENDING',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceVersion" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "originalFileName" TEXT,
    "declaredMimeType" TEXT,
    "detectedMimeType" TEXT,
    "objectKey" TEXT,
    "sizeBytes" BIGINT,
    "contentHtml" TEXT,
    "contentMarkdown" TEXT,
    "captureMetadata" JSONB,
    "parsingStage" "ParsingStage" NOT NULL DEFAULT 'PENDING',
    "parsingQuality" "ParsingQuality",
    "parsingConfidence" DOUBLE PRECISION,
    "qualityWarnings" JSONB,
    "failureCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSection" (
    "id" SERIAL NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SourceSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceChunk" (
    "id" SERIAL NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "sectionId" INTEGER,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "SourceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceAnchor" (
    "id" SERIAL NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "sectionId" INTEGER,
    "chunkId" INTEGER,
    "key" TEXT NOT NULL,
    "kind" "SourceAnchorKind" NOT NULL,
    "locator" JSONB NOT NULL,
    "quote" TEXT NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,

    CONSTRAINT "SourceAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" SERIAL NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "importance" "ConceptImportance" NOT NULL DEFAULT 'SUPPORTING',
    "status" "MapItemStatus" NOT NULL DEFAULT 'PROPOSED',
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptDependency" (
    "id" SERIAL NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "prerequisiteConceptId" INTEGER NOT NULL,
    "dependentConceptId" INTEGER NOT NULL,
    "relationType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "ConceptDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptAnchor" (
    "sourceVersionId" INTEGER NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "anchorId" INTEGER NOT NULL,

    CONSTRAINT "ConceptAnchor_pkey" PRIMARY KEY ("sourceVersionId","conceptId","anchorId")
);

-- CreateTable
CREATE TABLE "LearningUnit" (
    "id" SERIAL NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "status" "MapItemStatus" NOT NULL DEFAULT 'PROPOSED',
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "LearningUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUnitConcept" (
    "sourceVersionId" INTEGER NOT NULL,
    "learningUnitId" INTEGER NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "LearningUnitConcept_pkey" PRIMARY KEY ("sourceVersionId","learningUnitId","conceptId")
);

-- CreateTable
CREATE TABLE "LearningUnitAnchor" (
    "sourceVersionId" INTEGER NOT NULL,
    "learningUnitId" INTEGER NOT NULL,
    "anchorId" INTEGER NOT NULL,

    CONSTRAINT "LearningUnitAnchor_pkey" PRIMARY KEY ("sourceVersionId","learningUnitId","anchorId")
);

-- CreateTable
CREATE TABLE "LearningProject" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "LearningProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "unitsConfirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningContract" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "goal" TEXT NOT NULL,
    "successCriteria" TEXT,
    "timeBudgetMinutes" INTEGER NOT NULL,
    "priorKnowledge" TEXT,
    "status" "LearningContractStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningContractUnit" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "learningUnitId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningContractUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutoringSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "learningContractId" INTEGER NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "currentUnitId" INTEGER,
    "modelProfileId" INTEGER NOT NULL,
    "actionPromptVersionId" INTEGER NOT NULL,
    "evaluationPromptVersionId" INTEGER NOT NULL,
    "graphThreadId" TEXT NOT NULL,
    "status" "TutoringSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentTurn" INTEGER NOT NULL DEFAULT 0,
    "maxTurns" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutoringSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutoringTurn" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "TutoringTurnStatus" NOT NULL DEFAULT 'PENDING',
    "targetConceptId" INTEGER,
    "actionKind" "TutorActionKind",
    "strategyKey" TEXT,
    "tutorContent" TEXT,
    "actionMetadata" JSONB,
    "userAnswer" TEXT,
    "evaluationOutcome" "EvaluationOutcome",
    "evaluationMetadata" JSONB,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TutoringTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnderstandingEvidence" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "turnId" INTEGER NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "operationType" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "outcome" "EvaluationOutcome" NOT NULL,
    "correctness" DOUBLE PRECISION NOT NULL,
    "causalCompleteness" DOUBLE PRECISION NOT NULL,
    "boundaryAwareness" DOUBLE PRECISION NOT NULL,
    "sourceAlignment" DOUBLE PRECISION NOT NULL,
    "transferAbility" DOUBLE PRECISION NOT NULL,
    "confirmedPoints" JSONB NOT NULL,
    "omissions" JSONB NOT NULL,
    "disagreements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnderstandingEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceAnchor" (
    "sourceVersionId" INTEGER NOT NULL,
    "evidenceId" INTEGER NOT NULL,
    "anchorId" INTEGER NOT NULL,

    CONSTRAINT "EvidenceAnchor_pkey" PRIMARY KEY ("sourceVersionId","evidenceId","anchorId")
);

-- CreateTable
CREATE TABLE "ConceptState" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "level" "UnderstandingLevel" NOT NULL DEFAULT 'UNSEEN',
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "latestEvidenceId" INTEGER,
    "disagreement" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnerStrategy" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "strategyKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "statistics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileEvidence" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "strategyId" INTEGER NOT NULL,
    "evidenceId" INTEGER NOT NULL,
    "effect" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtomicNote" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tutoringSessionId" INTEGER NOT NULL,
    "sourceTurnId" INTEGER NOT NULL,
    "sourceVersionId" INTEGER NOT NULL,
    "evidenceId" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "personalExample" TEXT,
    "applicability" TEXT,
    "boundaries" TEXT,
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtomicNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtomicNoteAnchor" (
    "sourceVersionId" INTEGER NOT NULL,
    "noteId" INTEGER NOT NULL,
    "anchorId" INTEGER NOT NULL,

    CONSTRAINT "AtomicNoteAnchor_pkey" PRIMARY KEY ("sourceVersionId","noteId","anchorId")
);

-- CreateTable
CREATE TABLE "AtomicNoteLink" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sourceNoteId" INTEGER NOT NULL,
    "targetNoteId" INTEGER NOT NULL,
    "relationType" TEXT NOT NULL,
    "status" "NoteLinkStatus" NOT NULL DEFAULT 'SUGGESTED',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtomicNoteLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelProvider" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelProfile" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "modelName" TEXT NOT NULL,
    "status" "ModelConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "temperature" DOUBLE PRECISION,
    "maxOutputTokens" INTEGER,
    "timeoutMs" INTEGER NOT NULL,
    "maxRetries" INTEGER NOT NULL DEFAULT 1,
    "fallbackOrder" INTEGER NOT NULL DEFAULT 0,
    "fallbackProfileId" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" SERIAL NOT NULL,
    "kind" "PromptKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "outputSchemaVersion" TEXT NOT NULL,
    "status" "ModelConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelCall" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tutoringSessionId" INTEGER,
    "tutoringTurnId" INTEGER,
    "modelProfileId" INTEGER NOT NULL,
    "promptVersionId" INTEGER NOT NULL,
    "status" "ModelCallStatus" NOT NULL DEFAULT 'PENDING',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" BIGINT,
    "latencyMs" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "sanitizedError" TEXT,
    "errorCategory" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ModelCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaPolicy" (
    "id" SERIAL NOT NULL,
    "metric" "QuotaMetric" NOT NULL,
    "limit" BIGINT NOT NULL,
    "period" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuotaOverride" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "metric" "QuotaMetric" NOT NULL,
    "limit" BIGINT NOT NULL,
    "period" TEXT,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserQuotaOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailNormalized_key" ON "User"("emailNormalized");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_status_emailVerifiedAt_idx" ON "User"("status", "emailVerifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebSession_tokenHash_key" ON "WebSession"("tokenHash");

-- CreateIndex
CREATE INDEX "WebSession_userId_idx" ON "WebSession"("userId");

-- CreateIndex
CREATE INDEX "WebSession_userId_familyId_idx" ON "WebSession"("userId", "familyId");

-- CreateIndex
CREATE INDEX "WebSession_expiresAt_idx" ON "WebSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_idx" ON "EmailToken"("userId");

-- CreateIndex
CREATE INDEX "EmailToken_expiresAt_idx" ON "EmailToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

-- CreateIndex
CREATE INDEX "ApiToken_userId_revokedAt_idx" ON "ApiToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetUserId_createdAt_idx" ON "AuditEvent"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_result_createdAt_idx" ON "AuditEvent"("action", "result", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_key_key" ON "Tool"("key");

-- CreateIndex
CREATE INDEX "Job_userId_createdAt_idx" ON "Job"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Job_toolKey_status_createdAt_idx" ON "Job"("toolKey", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Job_status_updatedAt_idx" ON "Job"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_userId_toolKey_idempotencyKey_key" ON "Job"("userId", "toolKey", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Job_toolKey_bullmqJobId_key" ON "Job"("toolKey", "bullmqJobId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_id_userId_key" ON "Job"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeItem_jobId_key" ON "KnowledgeItem"("jobId");

-- CreateIndex
CREATE INDEX "KnowledgeItem_userId_capturedAt_idx" ON "KnowledgeItem"("userId", "capturedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeItem_jobId_userId_key" ON "KnowledgeItem"("jobId", "userId");

-- CreateIndex
CREATE INDEX "LearningSource_userId_status_updatedAt_idx" ON "LearningSource"("userId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LearningSource_userId_canonicalUrl_key" ON "LearningSource"("userId", "canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "LearningSource_id_userId_key" ON "LearningSource"("id", "userId");

-- CreateIndex
CREATE INDEX "SourceVersion_userId_contentHash_idx" ON "SourceVersion"("userId", "contentHash");

-- CreateIndex
CREATE INDEX "SourceVersion_userId_createdAt_idx" ON "SourceVersion"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SourceVersion_parsingStage_createdAt_idx" ON "SourceVersion"("parsingStage", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceVersion_sourceId_version_key" ON "SourceVersion"("sourceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SourceVersion_sourceId_contentHash_key" ON "SourceVersion"("sourceId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "SourceVersion_id_userId_key" ON "SourceVersion"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceVersion_id_userId_sourceId_key" ON "SourceVersion"("id", "userId", "sourceId");

-- CreateIndex
CREATE INDEX "SourceSection_parentId_idx" ON "SourceSection"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSection_sourceVersionId_key_key" ON "SourceSection"("sourceVersionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSection_sourceVersionId_position_key" ON "SourceSection"("sourceVersionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSection_id_sourceVersionId_key" ON "SourceSection"("id", "sourceVersionId");

-- CreateIndex
CREATE INDEX "SourceChunk_sectionId_position_idx" ON "SourceChunk"("sectionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SourceChunk_sourceVersionId_position_key" ON "SourceChunk"("sourceVersionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SourceChunk_id_sourceVersionId_key" ON "SourceChunk"("id", "sourceVersionId");

-- CreateIndex
CREATE INDEX "SourceAnchor_sourceVersionId_kind_idx" ON "SourceAnchor"("sourceVersionId", "kind");

-- CreateIndex
CREATE INDEX "SourceAnchor_sectionId_idx" ON "SourceAnchor"("sectionId");

-- CreateIndex
CREATE INDEX "SourceAnchor_chunkId_idx" ON "SourceAnchor"("chunkId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceAnchor_sourceVersionId_key_key" ON "SourceAnchor"("sourceVersionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SourceAnchor_id_sourceVersionId_key" ON "SourceAnchor"("id", "sourceVersionId");

-- CreateIndex
CREATE INDEX "Concept_sourceVersionId_importance_status_idx" ON "Concept"("sourceVersionId", "importance", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_sourceVersionId_key_key" ON "Concept"("sourceVersionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_id_sourceVersionId_key" ON "Concept"("id", "sourceVersionId");

-- CreateIndex
CREATE INDEX "ConceptDependency_dependentConceptId_idx" ON "ConceptDependency"("dependentConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptDependency_sourceVersionId_prerequisiteConceptId_dep_key" ON "ConceptDependency"("sourceVersionId", "prerequisiteConceptId", "dependentConceptId", "relationType");

-- CreateIndex
CREATE INDEX "ConceptAnchor_anchorId_idx" ON "ConceptAnchor"("anchorId");

-- CreateIndex
CREATE INDEX "LearningUnit_sourceVersionId_status_idx" ON "LearningUnit"("sourceVersionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUnit_sourceVersionId_position_key" ON "LearningUnit"("sourceVersionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUnit_id_sourceVersionId_key" ON "LearningUnit"("id", "sourceVersionId");

-- CreateIndex
CREATE INDEX "LearningUnitConcept_conceptId_idx" ON "LearningUnitConcept"("conceptId");

-- CreateIndex
CREATE INDEX "LearningUnitAnchor_anchorId_idx" ON "LearningUnitAnchor"("anchorId");

-- CreateIndex
CREATE INDEX "LearningProject_userId_updatedAt_idx" ON "LearningProject"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "LearningProject_userId_sourceId_idx" ON "LearningProject"("userId", "sourceId");

-- CreateIndex
CREATE INDEX "LearningProject_sourceVersionId_idx" ON "LearningProject"("sourceVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningProject_id_userId_key" ON "LearningProject"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningProject_id_userId_sourceVersionId_key" ON "LearningProject"("id", "userId", "sourceVersionId");

-- CreateIndex
CREATE INDEX "LearningContract_userId_createdAt_idx" ON "LearningContract"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LearningContract_projectId_version_key" ON "LearningContract"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LearningContract_id_userId_key" ON "LearningContract"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningContract_id_userId_projectId_key" ON "LearningContract"("id", "userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningContract_id_userId_sourceVersionId_key" ON "LearningContract"("id", "userId", "sourceVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningContract_id_userId_projectId_sourceVersionId_key" ON "LearningContract"("id", "userId", "projectId", "sourceVersionId");

-- CreateIndex
CREATE INDEX "LearningContractUnit_userId_sourceVersionId_idx" ON "LearningContractUnit"("userId", "sourceVersionId");

-- CreateIndex
CREATE INDEX "LearningContractUnit_learningUnitId_idx" ON "LearningContractUnit"("learningUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningContractUnit_contractId_learningUnitId_key" ON "LearningContractUnit"("contractId", "learningUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningContractUnit_contractId_position_key" ON "LearningContractUnit"("contractId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TutoringSession_graphThreadId_key" ON "TutoringSession"("graphThreadId");

-- CreateIndex
CREATE INDEX "TutoringSession_userId_status_updatedAt_idx" ON "TutoringSession"("userId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "TutoringSession_projectId_status_idx" ON "TutoringSession"("projectId", "status");

-- CreateIndex
CREATE INDEX "TutoringSession_sourceVersionId_idx" ON "TutoringSession"("sourceVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TutoringSession_id_userId_key" ON "TutoringSession"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TutoringSession_id_userId_sourceVersionId_key" ON "TutoringSession"("id", "userId", "sourceVersionId");

-- CreateIndex
CREATE INDEX "TutoringTurn_userId_startedAt_idx" ON "TutoringTurn"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "TutoringTurn_sessionId_status_idx" ON "TutoringTurn"("sessionId", "status");

-- CreateIndex
CREATE INDEX "TutoringTurn_correlationId_idx" ON "TutoringTurn"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "TutoringTurn_sessionId_position_key" ON "TutoringTurn"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TutoringTurn_sessionId_idempotencyKey_key" ON "TutoringTurn"("sessionId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "TutoringTurn_id_userId_key" ON "TutoringTurn"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TutoringTurn_id_userId_sourceVersionId_key" ON "TutoringTurn"("id", "userId", "sourceVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TutoringTurn_id_userId_sessionId_sourceVersionId_key" ON "TutoringTurn"("id", "userId", "sessionId", "sourceVersionId");

-- CreateIndex
CREATE INDEX "UnderstandingEvidence_userId_createdAt_idx" ON "UnderstandingEvidence"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UnderstandingEvidence_conceptId_createdAt_idx" ON "UnderstandingEvidence"("conceptId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UnderstandingEvidence_sessionId_turnId_operationType_key" ON "UnderstandingEvidence"("sessionId", "turnId", "operationType");

-- CreateIndex
CREATE UNIQUE INDEX "UnderstandingEvidence_id_userId_key" ON "UnderstandingEvidence"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UnderstandingEvidence_id_sourceVersionId_key" ON "UnderstandingEvidence"("id", "sourceVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "UnderstandingEvidence_id_userId_sourceVersionId_key" ON "UnderstandingEvidence"("id", "userId", "sourceVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "UnderstandingEvidence_id_userId_sourceVersionId_conceptId_key" ON "UnderstandingEvidence"("id", "userId", "sourceVersionId", "conceptId");

-- CreateIndex
CREATE INDEX "EvidenceAnchor_anchorId_idx" ON "EvidenceAnchor"("anchorId");

-- CreateIndex
CREATE INDEX "ConceptState_userId_level_idx" ON "ConceptState"("userId", "level");

-- CreateIndex
CREATE INDEX "ConceptState_userId_updatedAt_idx" ON "ConceptState"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ConceptState_projectId_conceptId_key" ON "ConceptState"("projectId", "conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptState_id_userId_key" ON "ConceptState"("id", "userId");

-- CreateIndex
CREATE INDEX "LearnerStrategy_userId_enabled_idx" ON "LearnerStrategy"("userId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerStrategy_userId_strategyKey_key" ON "LearnerStrategy"("userId", "strategyKey");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerStrategy_id_userId_key" ON "LearnerStrategy"("id", "userId");

-- CreateIndex
CREATE INDEX "ProfileEvidence_evidenceId_idx" ON "ProfileEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "ProfileEvidence_userId_idx" ON "ProfileEvidence"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileEvidence_strategyId_evidenceId_key" ON "ProfileEvidence"("strategyId", "evidenceId");

-- CreateIndex
CREATE INDEX "AtomicNote_userId_status_updatedAt_idx" ON "AtomicNote"("userId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "AtomicNote_sourceVersionId_idx" ON "AtomicNote"("sourceVersionId");

-- CreateIndex
CREATE INDEX "AtomicNote_sourceTurnId_idx" ON "AtomicNote"("sourceTurnId");

-- CreateIndex
CREATE UNIQUE INDEX "AtomicNote_userId_idempotencyKey_key" ON "AtomicNote"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AtomicNote_id_userId_key" ON "AtomicNote"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AtomicNote_id_sourceVersionId_key" ON "AtomicNote"("id", "sourceVersionId");

-- CreateIndex
CREATE INDEX "AtomicNoteAnchor_anchorId_idx" ON "AtomicNoteAnchor"("anchorId");

-- CreateIndex
CREATE INDEX "AtomicNoteLink_userId_status_idx" ON "AtomicNoteLink"("userId", "status");

-- CreateIndex
CREATE INDEX "AtomicNoteLink_targetNoteId_idx" ON "AtomicNoteLink"("targetNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "AtomicNoteLink_userId_sourceNoteId_targetNoteId_relationTyp_key" ON "AtomicNoteLink"("userId", "sourceNoteId", "targetNoteId", "relationType");

-- CreateIndex
CREATE UNIQUE INDEX "ModelProvider_name_key" ON "ModelProvider"("name");

-- CreateIndex
CREATE INDEX "ModelProvider_enabled_idx" ON "ModelProvider"("enabled");

-- CreateIndex
CREATE INDEX "ModelProfile_providerId_status_idx" ON "ModelProfile"("providerId", "status");

-- CreateIndex
CREATE INDEX "ModelProfile_status_fallbackOrder_idx" ON "ModelProfile"("status", "fallbackOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ModelProfile_name_version_key" ON "ModelProfile"("name", "version");

-- CreateIndex
CREATE INDEX "PromptVersion_kind_status_idx" ON "PromptVersion"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_kind_version_key" ON "PromptVersion"("kind", "version");

-- CreateIndex
CREATE INDEX "ModelCall_userId_createdAt_idx" ON "ModelCall"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ModelCall_modelProfileId_status_createdAt_idx" ON "ModelCall"("modelProfileId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ModelCall_correlationId_idx" ON "ModelCall"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaPolicy_metric_key" ON "QuotaPolicy"("metric");

-- CreateIndex
CREATE INDEX "UserQuotaOverride_userId_expiresAt_idx" ON "UserQuotaOverride"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserQuotaOverride_userId_metric_key" ON "UserQuotaOverride"("userId", "metric");

-- AddForeignKey
ALTER TABLE "WebSession" ADD CONSTRAINT "WebSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_jobId_userId_fkey" FOREIGN KEY ("jobId", "userId") REFERENCES "Job"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSource" ADD CONSTRAINT "LearningSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceVersion" ADD CONSTRAINT "SourceVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceVersion" ADD CONSTRAINT "SourceVersion_sourceId_userId_fkey" FOREIGN KEY ("sourceId", "userId") REFERENCES "LearningSource"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSection" ADD CONSTRAINT "SourceSection_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSection" ADD CONSTRAINT "SourceSection_parentId_sourceVersionId_fkey" FOREIGN KEY ("parentId", "sourceVersionId") REFERENCES "SourceSection"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChunk" ADD CONSTRAINT "SourceChunk_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChunk" ADD CONSTRAINT "SourceChunk_sectionId_sourceVersionId_fkey" FOREIGN KEY ("sectionId", "sourceVersionId") REFERENCES "SourceSection"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAnchor" ADD CONSTRAINT "SourceAnchor_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAnchor" ADD CONSTRAINT "SourceAnchor_sectionId_sourceVersionId_fkey" FOREIGN KEY ("sectionId", "sourceVersionId") REFERENCES "SourceSection"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAnchor" ADD CONSTRAINT "SourceAnchor_chunkId_sourceVersionId_fkey" FOREIGN KEY ("chunkId", "sourceVersionId") REFERENCES "SourceChunk"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptDependency" ADD CONSTRAINT "ConceptDependency_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptDependency" ADD CONSTRAINT "ConceptDependency_prerequisiteConceptId_sourceVersionId_fkey" FOREIGN KEY ("prerequisiteConceptId", "sourceVersionId") REFERENCES "Concept"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptDependency" ADD CONSTRAINT "ConceptDependency_dependentConceptId_sourceVersionId_fkey" FOREIGN KEY ("dependentConceptId", "sourceVersionId") REFERENCES "Concept"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptAnchor" ADD CONSTRAINT "ConceptAnchor_conceptId_sourceVersionId_fkey" FOREIGN KEY ("conceptId", "sourceVersionId") REFERENCES "Concept"("id", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptAnchor" ADD CONSTRAINT "ConceptAnchor_anchorId_sourceVersionId_fkey" FOREIGN KEY ("anchorId", "sourceVersionId") REFERENCES "SourceAnchor"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUnit" ADD CONSTRAINT "LearningUnit_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUnitConcept" ADD CONSTRAINT "LearningUnitConcept_learningUnitId_sourceVersionId_fkey" FOREIGN KEY ("learningUnitId", "sourceVersionId") REFERENCES "LearningUnit"("id", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUnitConcept" ADD CONSTRAINT "LearningUnitConcept_conceptId_sourceVersionId_fkey" FOREIGN KEY ("conceptId", "sourceVersionId") REFERENCES "Concept"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUnitAnchor" ADD CONSTRAINT "LearningUnitAnchor_learningUnitId_sourceVersionId_fkey" FOREIGN KEY ("learningUnitId", "sourceVersionId") REFERENCES "LearningUnit"("id", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUnitAnchor" ADD CONSTRAINT "LearningUnitAnchor_anchorId_sourceVersionId_fkey" FOREIGN KEY ("anchorId", "sourceVersionId") REFERENCES "SourceAnchor"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProject" ADD CONSTRAINT "LearningProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProject" ADD CONSTRAINT "LearningProject_sourceId_userId_fkey" FOREIGN KEY ("sourceId", "userId") REFERENCES "LearningSource"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProject" ADD CONSTRAINT "LearningProject_sourceVersionId_userId_sourceId_fkey" FOREIGN KEY ("sourceVersionId", "userId", "sourceId") REFERENCES "SourceVersion"("id", "userId", "sourceId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningContract" ADD CONSTRAINT "LearningContract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningContract" ADD CONSTRAINT "LearningContract_projectId_userId_sourceVersionId_fkey" FOREIGN KEY ("projectId", "userId", "sourceVersionId") REFERENCES "LearningProject"("id", "userId", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningContract" ADD CONSTRAINT "LearningContract_sourceVersionId_userId_fkey" FOREIGN KEY ("sourceVersionId", "userId") REFERENCES "SourceVersion"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningContractUnit" ADD CONSTRAINT "LearningContractUnit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningContractUnit" ADD CONSTRAINT "LearningContractUnit_contractId_userId_sourceVersionId_fkey" FOREIGN KEY ("contractId", "userId", "sourceVersionId") REFERENCES "LearningContract"("id", "userId", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningContractUnit" ADD CONSTRAINT "LearningContractUnit_learningUnitId_sourceVersionId_fkey" FOREIGN KEY ("learningUnitId", "sourceVersionId") REFERENCES "LearningUnit"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_projectId_userId_sourceVersionId_fkey" FOREIGN KEY ("projectId", "userId", "sourceVersionId") REFERENCES "LearningProject"("id", "userId", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_learningContractId_userId_projectId_source_fkey" FOREIGN KEY ("learningContractId", "userId", "projectId", "sourceVersionId") REFERENCES "LearningContract"("id", "userId", "projectId", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_sourceVersionId_userId_fkey" FOREIGN KEY ("sourceVersionId", "userId") REFERENCES "SourceVersion"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_currentUnitId_sourceVersionId_fkey" FOREIGN KEY ("currentUnitId", "sourceVersionId") REFERENCES "LearningUnit"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_modelProfileId_fkey" FOREIGN KEY ("modelProfileId") REFERENCES "ModelProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_actionPromptVersionId_fkey" FOREIGN KEY ("actionPromptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_evaluationPromptVersionId_fkey" FOREIGN KEY ("evaluationPromptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringTurn" ADD CONSTRAINT "TutoringTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringTurn" ADD CONSTRAINT "TutoringTurn_sessionId_userId_sourceVersionId_fkey" FOREIGN KEY ("sessionId", "userId", "sourceVersionId") REFERENCES "TutoringSession"("id", "userId", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringTurn" ADD CONSTRAINT "TutoringTurn_targetConceptId_sourceVersionId_fkey" FOREIGN KEY ("targetConceptId", "sourceVersionId") REFERENCES "Concept"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnderstandingEvidence" ADD CONSTRAINT "UnderstandingEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnderstandingEvidence" ADD CONSTRAINT "UnderstandingEvidence_sessionId_userId_sourceVersionId_fkey" FOREIGN KEY ("sessionId", "userId", "sourceVersionId") REFERENCES "TutoringSession"("id", "userId", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnderstandingEvidence" ADD CONSTRAINT "UnderstandingEvidence_turnId_userId_sessionId_sourceVersio_fkey" FOREIGN KEY ("turnId", "userId", "sessionId", "sourceVersionId") REFERENCES "TutoringTurn"("id", "userId", "sessionId", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnderstandingEvidence" ADD CONSTRAINT "UnderstandingEvidence_conceptId_sourceVersionId_fkey" FOREIGN KEY ("conceptId", "sourceVersionId") REFERENCES "Concept"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAnchor" ADD CONSTRAINT "EvidenceAnchor_evidenceId_sourceVersionId_fkey" FOREIGN KEY ("evidenceId", "sourceVersionId") REFERENCES "UnderstandingEvidence"("id", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAnchor" ADD CONSTRAINT "EvidenceAnchor_anchorId_sourceVersionId_fkey" FOREIGN KEY ("anchorId", "sourceVersionId") REFERENCES "SourceAnchor"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptState" ADD CONSTRAINT "ConceptState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptState" ADD CONSTRAINT "ConceptState_projectId_userId_sourceVersionId_fkey" FOREIGN KEY ("projectId", "userId", "sourceVersionId") REFERENCES "LearningProject"("id", "userId", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptState" ADD CONSTRAINT "ConceptState_conceptId_sourceVersionId_fkey" FOREIGN KEY ("conceptId", "sourceVersionId") REFERENCES "Concept"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptState" ADD CONSTRAINT "ConceptState_latestEvidenceId_userId_sourceVersionId_conce_fkey" FOREIGN KEY ("latestEvidenceId", "userId", "sourceVersionId", "conceptId") REFERENCES "UnderstandingEvidence"("id", "userId", "sourceVersionId", "conceptId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerStrategy" ADD CONSTRAINT "LearnerStrategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileEvidence" ADD CONSTRAINT "ProfileEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileEvidence" ADD CONSTRAINT "ProfileEvidence_strategyId_userId_fkey" FOREIGN KEY ("strategyId", "userId") REFERENCES "LearnerStrategy"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileEvidence" ADD CONSTRAINT "ProfileEvidence_evidenceId_userId_fkey" FOREIGN KEY ("evidenceId", "userId") REFERENCES "UnderstandingEvidence"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtomicNote" ADD CONSTRAINT "AtomicNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtomicNote" ADD CONSTRAINT "AtomicNote_tutoringSessionId_userId_sourceVersionId_fkey" FOREIGN KEY ("tutoringSessionId", "userId", "sourceVersionId") REFERENCES "TutoringSession"("id", "userId", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtomicNote" ADD CONSTRAINT "AtomicNote_sourceTurnId_userId_tutoringSessionId_sourceVer_fkey" FOREIGN KEY ("sourceTurnId", "userId", "tutoringSessionId", "sourceVersionId") REFERENCES "TutoringTurn"("id", "userId", "sessionId", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtomicNote" ADD CONSTRAINT "AtomicNote_sourceVersionId_userId_fkey" FOREIGN KEY ("sourceVersionId", "userId") REFERENCES "SourceVersion"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtomicNote" ADD CONSTRAINT "AtomicNote_evidenceId_userId_sourceVersionId_fkey" FOREIGN KEY ("evidenceId", "userId", "sourceVersionId") REFERENCES "UnderstandingEvidence"("id", "userId", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtomicNoteAnchor" ADD CONSTRAINT "AtomicNoteAnchor_noteId_sourceVersionId_fkey" FOREIGN KEY ("noteId", "sourceVersionId") REFERENCES "AtomicNote"("id", "sourceVersionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtomicNoteAnchor" ADD CONSTRAINT "AtomicNoteAnchor_anchorId_sourceVersionId_fkey" FOREIGN KEY ("anchorId", "sourceVersionId") REFERENCES "SourceAnchor"("id", "sourceVersionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtomicNoteLink" ADD CONSTRAINT "AtomicNoteLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtomicNoteLink" ADD CONSTRAINT "AtomicNoteLink_sourceNoteId_userId_fkey" FOREIGN KEY ("sourceNoteId", "userId") REFERENCES "AtomicNote"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtomicNoteLink" ADD CONSTRAINT "AtomicNoteLink_targetNoteId_userId_fkey" FOREIGN KEY ("targetNoteId", "userId") REFERENCES "AtomicNote"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelProfile" ADD CONSTRAINT "ModelProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ModelProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelProfile" ADD CONSTRAINT "ModelProfile_fallbackProfileId_fkey" FOREIGN KEY ("fallbackProfileId") REFERENCES "ModelProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCall" ADD CONSTRAINT "ModelCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCall" ADD CONSTRAINT "ModelCall_tutoringSessionId_userId_fkey" FOREIGN KEY ("tutoringSessionId", "userId") REFERENCES "TutoringSession"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCall" ADD CONSTRAINT "ModelCall_tutoringTurnId_userId_fkey" FOREIGN KEY ("tutoringTurnId", "userId") REFERENCES "TutoringTurn"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCall" ADD CONSTRAINT "ModelCall_modelProfileId_fkey" FOREIGN KEY ("modelProfileId") REFERENCES "ModelProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCall" ADD CONSTRAINT "ModelCall_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuotaOverride" ADD CONSTRAINT "UserQuotaOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
