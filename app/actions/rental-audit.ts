'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '../../lib/auth-guard';
import { runRentalAudit } from '../../lib/rental-audit';
import { isAuditAdminStatus, type AuditAdminStatus } from '../../lib/rental-audit-rules';
import type {
  RentalAuditData,
  RentalAuditEventDto,
  RentalAuditOccurrenceDto,
  RentalAuditRunDto,
} from '../../lib/rental-audit-types';

const AUDIT_PERMISSION = 'permInteligencia';

type RunRow = {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  trigger: string;
  windowFrom: Date | null;
  windowTo: Date | null;
  totalRentals: number;
  totalLinkedItems: number;
  checksRun: number;
  occurrencesFound: number;
  occurrencesCleared: number;
  error: string | null;
  summary: string | null;
};

type EventRow = {
  id: string;
  action: string;
  note: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: Date;
  user: { name: string } | null;
};

type OccurrenceRow = {
  id: string;
  fingerprint: string;
  type: string;
  severity: string;
  entityType: string;
  entityId: string;
  orderId: string | null;
  rentalId: string | null;
  customerId: string | null;
  customerName: string | null;
  resource: string | null;
  rentalStartTime: Date | null;
  rentalEndTime: Date | null;
  title: string;
  details: string;
  evidence: Prisma.JsonValue | null;
  status: string;
  technicalStatus: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  occurrenceCount: number;
  clearedAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedByName: string | null;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  acknowledgedBy: { name: string } | null;
  resolvedBy: { name: string } | null;
  events: EventRow[];
};

function serializeRun(run: RunRow): RentalAuditRunDto {
  return {
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    status: run.status,
    trigger: run.trigger,
    windowFrom: run.windowFrom ? run.windowFrom.toISOString() : null,
    windowTo: run.windowTo ? run.windowTo.toISOString() : null,
    totalRentals: run.totalRentals,
    totalLinkedItems: run.totalLinkedItems,
    checksRun: run.checksRun,
    occurrencesFound: run.occurrencesFound,
    occurrencesCleared: run.occurrencesCleared,
    error: run.error,
    summary: run.summary,
  };
}

function serializeEvent(event: EventRow): RentalAuditEventDto {
  return {
    id: event.id,
    action: event.action,
    note: event.note,
    createdAt: event.createdAt.toISOString(),
    userName: event.userName ?? event.user?.name ?? null,
  };
}

function serializeOccurrence(occurrence: OccurrenceRow): RentalAuditOccurrenceDto {
  return {
    id: occurrence.id,
    fingerprint: occurrence.fingerprint,
    type: occurrence.type,
    severity: occurrence.severity,
    entityType: occurrence.entityType,
    entityId: occurrence.entityId,
    orderId: occurrence.orderId,
    rentalId: occurrence.rentalId,
    customerId: occurrence.customerId,
    customerName: occurrence.customerName,
    resource: occurrence.resource,
    rentalStartTime: occurrence.rentalStartTime ? occurrence.rentalStartTime.toISOString() : null,
    rentalEndTime: occurrence.rentalEndTime ? occurrence.rentalEndTime.toISOString() : null,
    title: occurrence.title,
    details: occurrence.details,
    evidence: occurrence.evidence,
    status: occurrence.status,
    technicalStatus: occurrence.technicalStatus,
    firstSeenAt: occurrence.firstSeenAt.toISOString(),
    lastSeenAt: occurrence.lastSeenAt.toISOString(),
    occurrenceCount: occurrence.occurrenceCount,
    clearedAt: occurrence.clearedAt ? occurrence.clearedAt.toISOString() : null,
    acknowledgedAt: occurrence.acknowledgedAt ? occurrence.acknowledgedAt.toISOString() : null,
    acknowledgedByName: occurrence.acknowledgedByName ?? occurrence.acknowledgedBy?.name ?? null,
    resolvedAt: occurrence.resolvedAt ? occurrence.resolvedAt.toISOString() : null,
    resolvedByName: occurrence.resolvedByName ?? occurrence.resolvedBy?.name ?? null,
    resolutionNote: occurrence.resolutionNote,
    events: occurrence.events.map(serializeEvent),
  };
}

export async function getRentalAuditData(): Promise<RentalAuditData> {
  await requirePermission(AUDIT_PERMISSION);

  const [runs, occurrences, lastRun, latestRun, total, active, cleared, open, acknowledged, resolved, ignored, pending, severityGroups] = await Promise.all([
    prisma.rentalAuditRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
    prisma.rentalAuditOccurrence.findMany({
      orderBy: [{ technicalStatus: 'asc' }, { lastSeenAt: 'desc' }],
      take: 1000,
      include: {
        acknowledgedBy: { select: { name: true } },
        resolvedBy: { select: { name: true } },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { name: true } } },
        },
      },
    }),
    prisma.rentalAuditRun.findFirst({ where: { status: 'SUCCESS' }, orderBy: { startedAt: 'desc' } }),
    prisma.rentalAuditRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.rentalAuditOccurrence.count(),
    prisma.rentalAuditOccurrence.count({ where: { technicalStatus: 'ACTIVE' } }),
    prisma.rentalAuditOccurrence.count({ where: { technicalStatus: 'CLEARED' } }),
    prisma.rentalAuditOccurrence.count({ where: { status: 'OPEN' } }),
    prisma.rentalAuditOccurrence.count({ where: { status: 'ACKNOWLEDGED' } }),
    prisma.rentalAuditOccurrence.count({ where: { status: 'RESOLVED' } }),
    prisma.rentalAuditOccurrence.count({ where: { status: 'IGNORED' } }),
    prisma.rentalAuditOccurrence.count({ where: { technicalStatus: 'ACTIVE', status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
    prisma.rentalAuditOccurrence.groupBy({ by: ['severity'], _count: { _all: true } }),
  ]);

  const bySeverity: Record<string, number> = {};
  for (const group of severityGroups) {
    bySeverity[group.severity] = group._count._all;
  }

  return {
    success: true,
    runs: runs.map(serializeRun),
    occurrences: (occurrences as OccurrenceRow[]).map(serializeOccurrence),
    counts: { total, active, cleared, open, acknowledged, resolved, ignored, pending, bySeverity },
    lastRun: lastRun ? serializeRun(lastRun as RunRow) : null,
    latestRun: latestRun ? serializeRun(latestRun as RunRow) : null,
  };
}

export async function runRentalAuditNow() {
  const user = await requirePermission(AUDIT_PERMISSION);
  if (user.role !== 'ADMIN') {
    throw new Error('Apenas administradores podem executar a auditoria manualmente.');
  }

  const result = await runRentalAudit('MANUAL');
  revalidatePath('/inteligencia');
  return { success: true, ...result };
}

export async function updateRentalAuditOccurrence(
  id: string,
  status: AuditAdminStatus,
  note?: string
) {
  const user = await requirePermission(AUDIT_PERMISSION);
  if (user.role !== 'ADMIN') {
    throw new Error('Apenas administradores podem classificar ou resolver ocorrências de auditoria.');
  }
  if (!id) throw new Error('Ocorrência inválida.');
  if (!isAuditAdminStatus(status)) throw new Error('Status inválido.');

  const noteText = String(note || '').trim().slice(0, 1000) || null;

  await prisma.$transaction(async tx => {
    const occurrence = await tx.rentalAuditOccurrence.findUnique({
      where: { id },
      select: { id: true, fingerprint: true, type: true, status: true },
    });
    if (!occurrence) throw new Error('Ocorrência não encontrada.');

    const now = new Date();
    const data: Prisma.RentalAuditOccurrenceUncheckedUpdateInput = { status };
    let action = 'NOTE';

    if (status === 'OPEN') {
      data.acknowledgedAt = null;
      data.acknowledgedByUserId = null;
      data.acknowledgedByName = null;
      data.resolvedAt = null;
      data.resolvedByUserId = null;
      data.resolvedByName = null;
      data.resolutionNote = null;
      action = 'REOPENED';
    } else if (status === 'ACKNOWLEDGED') {
      data.acknowledgedAt = now;
      data.acknowledgedByUserId = user.id;
      data.acknowledgedByName = user.name;
      data.resolvedAt = null;
      data.resolvedByUserId = null;
      data.resolvedByName = null;
      data.resolutionNote = null;
      action = 'ACKNOWLEDGED';
    } else {
      data.resolvedAt = now;
      data.resolvedByUserId = user.id;
      data.resolvedByName = user.name;
      data.resolutionNote = noteText;
      action = status;
    }

    await tx.rentalAuditOccurrence.update({ where: { id }, data });
    await tx.rentalAuditEvent.create({
      data: {
        occurrenceId: id,
        action,
        note: noteText,
        userId: user.id,
        userName: user.name,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'Auditoria de Reservas',
        details: `Ocorrência ${occurrence.fingerprint} (${occurrence.type}) alterada de ${occurrence.status} para ${status}.${noteText ? ` Nota: ${noteText}` : ''}`,
      },
    });
  });

  revalidatePath('/inteligencia');
  return { success: true };
}
