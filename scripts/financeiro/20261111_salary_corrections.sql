-- Correcoes de dados de salario - NAO EXECUTAR SEM AUTORIZACAO ESPECIFICA.
-- Nao fecha nem retifica outubro. A retificacao v2 deve ser feita depois,
-- via ADMIN, com reabertura/refechamento auditado.
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
    AND "entryKind" = 'INVENTORY_PURCHASE';

  IF june_count <> 1 THEN
    RAISE EXCEPTION 'Salario de junho nao esta no estado esperado. Abortando.';
  END IF;

  SELECT count(*) INTO october_count
  FROM public."FinancialEntry"
  WHERE id = 'cmwcb9qet0000gt08s4lr9f5f'
    AND category ILIKE 'sal%'
    AND "entryKind" = 'OPERATING'
    AND "competenceDate" = '2026-11-05 00:00:00';

  IF october_count <> 1 THEN
    RAISE EXCEPTION 'Salario de outubro nao esta no estado esperado. Abortando.';
  END IF;
END $$;

UPDATE public."FinancialEntry"
SET "entryKind" = 'OPERATING',
    "updatedAt" = now()
WHERE id = 'cmpyhesj10000i604bpxlshqb'
  AND category ILIKE 'sal%'
  AND "entryKind" = 'INVENTORY_PURCHASE';

INSERT INTO public."AuditLog" ("id", "userId", action, details, "timestamp")
VALUES (
  'salaryfix-' || substr(md5(clock_timestamp()::text || 'june'), 1, 24),
  'cmo05wmct0000k304m0bt19jp',
  'Correcao classificacao salario',
  'SALARIO FELIPE MASSAI (ID cmpyhesj10000i604bpxlshqb): entryKind INVENTORY_PURCHASE -> OPERATING. Competencia 03/06/2026.',
  now()
);

UPDATE public."FinancialEntry"
SET "competenceDate" = '2026-10-31 00:00:00',
    "updatedAt" = now()
WHERE id = 'cmwcb9qet0000gt08s4lr9f5f'
  AND category ILIKE 'sal%'
  AND "entryKind" = 'OPERATING'
  AND "competenceDate" = '2026-11-05 00:00:00';

INSERT INTO public."AuditLog" ("id", "userId", action, details, "timestamp")
VALUES (
  'salaryfix-' || substr(md5(clock_timestamp()::text || 'october'), 1, 24),
  'cmo05wmct0000k304m0bt19jp',
  'Correcao competencia salario',
  'SALARIO SEBASTIAO PACHECO (ID cmwcb9qet0000gt08s4lr9f5f): competenceDate 05/11/2026 -> 31/10/2026. Pagamento mantido em 11/11/2026 para o regime de caixa.',
  now()
);

COMMIT;
