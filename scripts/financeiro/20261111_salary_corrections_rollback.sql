-- Reversao das correcoes de salario - NAO EXECUTAR SEM AUTORIZACAO ESPECIFICA.
-- Restaura apenas os dois campos alterados; valores, pagamentos e datas de
-- vencimento permanecem intactos. Nao reabre nem retifica outubro.
BEGIN;

DO $$
DECLARE
  june_count int;
  october_count int;
BEGIN
  SELECT count(*) INTO june_count
  FROM public."FinancialEntry"
  WHERE id = 'cmpyhesj10000i604bpxlshqb'
    AND category ILIKE 'sal%'
    AND "entryKind" = 'OPERATING';

  IF june_count <> 1 THEN
    RAISE EXCEPTION 'Salario de junho nao esta corrigido. Abortando reversao.';
  END IF;

  SELECT count(*) INTO october_count
  FROM public."FinancialEntry"
  WHERE id = 'cmwcb9qet0000gt08s4lr9f5f'
    AND category ILIKE 'sal%'
    AND "competenceDate" = '2026-10-31 00:00:00';

  IF october_count <> 1 THEN
    RAISE EXCEPTION 'Salario de outubro nao esta na competencia corrigida. Abortando reversao.';
  END IF;
END $$;

UPDATE public."FinancialEntry"
SET "entryKind" = 'INVENTORY_PURCHASE',
    "updatedAt" = now()
WHERE id = 'cmpyhesj10000i604bpxlshqb'
  AND category ILIKE 'sal%'
  AND "entryKind" = 'OPERATING';

INSERT INTO public."AuditLog" ("id", "userId", action, details, "timestamp")
VALUES (
  'salaryfix-' || substr(md5(clock_timestamp()::text || 'june-revert'), 1, 24),
  'cmo05wmct0000k304m0bt19jp',
  'Reversao classificacao salario',
  'SALARIO FELIPE MASSAI (ID cmpyhesj10000i604bpxlshqb): entryKind OPERATING -> INVENTORY_PURCHASE (reversao autorizada).',
  now()
);

UPDATE public."FinancialEntry"
SET "competenceDate" = '2026-11-05 00:00:00',
    "updatedAt" = now()
WHERE id = 'cmwcb9qet0000gt08s4lr9f5f'
  AND category ILIKE 'sal%'
  AND "competenceDate" = '2026-10-31 00:00:00';

INSERT INTO public."AuditLog" ("id", "userId", action, details, "timestamp")
VALUES (
  'salaryfix-' || substr(md5(clock_timestamp()::text || 'october-revert'), 1, 24),
  'cmo05wmct0000k304m0bt19jp',
  'Reversao competencia salario',
  'SALARIO SEBASTIAO PACHECO (ID cmwcb9qet0000gt08s4lr9f5f): competenceDate 31/10/2026 -> 05/11/2026 (reversao autorizada).',
  now()
);

COMMIT;
