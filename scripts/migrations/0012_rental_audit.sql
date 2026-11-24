-- Auditoria automatica de reservas: execucoes, ocorrencias e historico de eventos.
-- Migracao aditiva. Nao altera tabelas operacionais existentes.
-- Substitui a 0007, que nunca foi aplicada. Aplicar somente apos backup verificado e autorizacao expressa.
BEGIN;

CREATE TABLE IF NOT EXISTS "RentalAuditRun" (
  "id" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
  "windowFrom" TIMESTAMP(3),
  "windowTo" TIMESTAMP(3),
  "totalRentals" INTEGER NOT NULL DEFAULT 0,
  "totalLinkedItems" INTEGER NOT NULL DEFAULT 0,
  "checksRun" INTEGER NOT NULL DEFAULT 0,
  "occurrencesFound" INTEGER NOT NULL DEFAULT 0,
  "occurrencesCleared" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "summary" TEXT,
  CONSTRAINT "RentalAuditRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RentalAuditOccurrence" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "orderId" TEXT,
  "rentalId" TEXT,
  "customerId" TEXT,
  "customerName" TEXT,
  "resource" TEXT,
  "rentalStartTime" TIMESTAMP(3),
  "rentalEndTime" TIMESTAMP(3),
  "title" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "evidence" JSONB,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "technicalStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "clearedAt" TIMESTAMP(3),
  "clearedRunId" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedByUserId" TEXT,
  "acknowledgedByName" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "resolvedByName" TEXT,
  "resolutionNote" TEXT,
  "lastRunId" TEXT,
  CONSTRAINT "RentalAuditOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RentalAuditEvent" (
  "id" TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "runId" TEXT,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "userId" TEXT,
  "userName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalAuditEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RentalAuditRun" ADD COLUMN IF NOT EXISTS "totalRentals" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RentalAuditRun" ADD COLUMN IF NOT EXISTS "totalLinkedItems" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RentalAuditRun" ADD COLUMN IF NOT EXISTS "occurrencesCleared" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "resource" TEXT;
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "rentalStartTime" TIMESTAMP(3);
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "rentalEndTime" TIMESTAMP(3);
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "evidence" JSONB;
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "technicalStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "clearedAt" TIMESTAMP(3);
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "clearedRunId" TEXT;
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "acknowledgedByUserId" TEXT;
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "acknowledgedByName" TEXT;
ALTER TABLE "RentalAuditOccurrence" ADD COLUMN IF NOT EXISTS "resolvedByName" TEXT;

ALTER TABLE "RentalAuditEvent" ADD COLUMN IF NOT EXISTS "userName" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "RentalAuditOccurrence_fingerprint_key"
  ON "RentalAuditOccurrence" ("fingerprint");
CREATE INDEX IF NOT EXISTS "RentalAuditRun_startedAt_idx"
  ON "RentalAuditRun" ("startedAt");
CREATE INDEX IF NOT EXISTS "RentalAuditRun_status_idx"
  ON "RentalAuditRun" ("status");
CREATE INDEX IF NOT EXISTS "RentalAuditOccurrence_technicalStatus_status_severity_idx"
  ON "RentalAuditOccurrence" ("technicalStatus", "status", "severity");
CREATE INDEX IF NOT EXISTS "RentalAuditOccurrence_status_severity_idx"
  ON "RentalAuditOccurrence" ("status", "severity");
CREATE INDEX IF NOT EXISTS "RentalAuditOccurrence_lastSeenAt_idx"
  ON "RentalAuditOccurrence" ("lastSeenAt");
CREATE INDEX IF NOT EXISTS "RentalAuditOccurrence_rentalId_idx"
  ON "RentalAuditOccurrence" ("rentalId");
CREATE INDEX IF NOT EXISTS "RentalAuditOccurrence_orderId_idx"
  ON "RentalAuditOccurrence" ("orderId");
CREATE INDEX IF NOT EXISTS "RentalAuditOccurrence_customerId_idx"
  ON "RentalAuditOccurrence" ("customerId");
CREATE INDEX IF NOT EXISTS "RentalAuditOccurrence_resource_idx"
  ON "RentalAuditOccurrence" ("resource");
CREATE INDEX IF NOT EXISTS "RentalAuditOccurrence_rentalStartTime_idx"
  ON "RentalAuditOccurrence" ("rentalStartTime");
CREATE INDEX IF NOT EXISTS "RentalAuditOccurrence_type_idx"
  ON "RentalAuditOccurrence" ("type");
CREATE INDEX IF NOT EXISTS "RentalAuditEvent_occurrenceId_createdAt_idx"
  ON "RentalAuditEvent" ("occurrenceId", "createdAt");
CREATE INDEX IF NOT EXISTS "RentalAuditEvent_runId_idx"
  ON "RentalAuditEvent" ("runId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RentalAuditOccurrence_resolvedByUserId_fkey'
  ) THEN
    ALTER TABLE "RentalAuditOccurrence"
      ADD CONSTRAINT "RentalAuditOccurrence_resolvedByUserId_fkey"
      FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RentalAuditOccurrence_acknowledgedByUserId_fkey'
  ) THEN
    ALTER TABLE "RentalAuditOccurrence"
      ADD CONSTRAINT "RentalAuditOccurrence_acknowledgedByUserId_fkey"
      FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RentalAuditEvent_occurrenceId_fkey'
  ) THEN
    ALTER TABLE "RentalAuditEvent"
      ADD CONSTRAINT "RentalAuditEvent_occurrenceId_fkey"
      FOREIGN KEY ("occurrenceId") REFERENCES "RentalAuditOccurrence"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RentalAuditEvent_userId_fkey'
  ) THEN
    ALTER TABLE "RentalAuditEvent"
      ADD CONSTRAINT "RentalAuditEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RentalAuditRun_status_check'
  ) THEN
    ALTER TABLE "RentalAuditRun"
      ADD CONSTRAINT "RentalAuditRun_status_check"
      CHECK ("status" IN ('RUNNING', 'SUCCESS', 'ERROR')) NOT VALID;
    ALTER TABLE "RentalAuditRun" VALIDATE CONSTRAINT "RentalAuditRun_status_check";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RentalAuditOccurrence_status_check'
  ) THEN
    ALTER TABLE "RentalAuditOccurrence"
      ADD CONSTRAINT "RentalAuditOccurrence_status_check"
      CHECK ("status" IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED')) NOT VALID;
    ALTER TABLE "RentalAuditOccurrence" VALIDATE CONSTRAINT "RentalAuditOccurrence_status_check";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RentalAuditOccurrence_technicalStatus_check'
  ) THEN
    ALTER TABLE "RentalAuditOccurrence"
      ADD CONSTRAINT "RentalAuditOccurrence_technicalStatus_check"
      CHECK ("technicalStatus" IN ('ACTIVE', 'CLEARED')) NOT VALID;
    ALTER TABLE "RentalAuditOccurrence" VALIDATE CONSTRAINT "RentalAuditOccurrence_technicalStatus_check";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RentalAuditOccurrence_severity_check'
  ) THEN
    ALTER TABLE "RentalAuditOccurrence"
      ADD CONSTRAINT "RentalAuditOccurrence_severity_check"
      CHECK ("severity" IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')) NOT VALID;
    ALTER TABLE "RentalAuditOccurrence" VALIDATE CONSTRAINT "RentalAuditOccurrence_severity_check";
  END IF;
END $$;

ALTER TABLE "RentalAuditRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentalAuditOccurrence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentalAuditEvent" ENABLE ROW LEVEL SECURITY;

COMMIT;

