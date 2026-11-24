export type RentalAuditRunDto = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  trigger: string;
  windowFrom: string | null;
  windowTo: string | null;
  totalRentals: number;
  totalLinkedItems: number;
  checksRun: number;
  occurrencesFound: number;
  occurrencesCleared: number;
  error: string | null;
  summary: string | null;
};

export type RentalAuditEventDto = {
  id: string;
  action: string;
  note: string | null;
  createdAt: string;
  userName: string | null;
};

export type RentalAuditOccurrenceDto = {
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
  rentalStartTime: string | null;
  rentalEndTime: string | null;
  title: string;
  details: string;
  evidence: unknown;
  status: string;
  technicalStatus: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  clearedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  events: RentalAuditEventDto[];
};

export type RentalAuditCounts = {
  total: number;
  active: number;
  cleared: number;
  open: number;
  acknowledged: number;
  resolved: number;
  ignored: number;
  pending: number;
  bySeverity: Record<string, number>;
};

export type RentalAuditData = {
  success: true;
  runs: RentalAuditRunDto[];
  occurrences: RentalAuditOccurrenceDto[];
  counts: RentalAuditCounts;
  lastRun: RentalAuditRunDto | null;
  latestRun: RentalAuditRunDto | null;
};

export const RENTAL_AUDIT_SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
  INFO: 'Informativa',
};

export const RENTAL_AUDIT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  ACKNOWLEDGED: 'Reconhecida',
  RESOLVED: 'Resolvida administrativamente',
  IGNORED: 'Ignorada',
};

export const RENTAL_AUDIT_TECHNICAL_LABELS: Record<string, string> = {
  ACTIVE: 'Ainda detectada',
  CLEARED: 'Eliminada tecnicamente',
};

export const RENTAL_AUDIT_ACTION_LABELS: Record<string, string> = {
  DETECTED: 'Detectada',
  CLEARED: 'Eliminada tecnicamente',
  REOPENED: 'Reaberta',
  ACKNOWLEDGED: 'Reconhecida',
  RESOLVED: 'Resolvida administrativamente',
  IGNORED: 'Ignorada',
  NOTE: 'Observação',
};
