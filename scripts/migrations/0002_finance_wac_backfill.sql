-- Backfill de custo médio inicial e classificação do DRE.
-- Executar somente após backup e após a correção pontual da NF 000540417.
-- Não altera quantidades físicas nem documentos fiscais.
BEGIN;

-- Abertura do WAC a partir do custo atual registrado no cadastro.
UPDATE public."Stock" s
SET "averageCost" = COALESCE(p.cost, 0)
FROM public."Product" p
WHERE p.id = s."productId";

UPDATE public."DepotStock" ds
SET "averageCost" = COALESCE(p.cost, 0)
FROM public."Product" p
WHERE p.id = ds."productId";

-- Ledger de abertura, sem duplicar em reexecução.
INSERT INTO public."InventoryCostLedger"
  ("id", "productId", "location", "movementType", "quantity", "unitCost", "totalCost", "balanceQty", "balanceAvgCost", "notes", "createdAt")
SELECT
  'open-' || substr(md5(s."productId" || 'BALCAO' || now()::text), 1, 24),
  s."productId",
  'BALCAO',
  'OPENING',
  s.quantity,
  s."averageCost",
  s.quantity * s."averageCost",
  s.quantity,
  s."averageCost",
  'Saldo inicial WAC - Balcão',
  now()
FROM public."Stock" s
WHERE NOT EXISTS (
  SELECT 1 FROM public."InventoryCostLedger" l
  WHERE l."productId" = s."productId" AND l.location = 'BALCAO' AND l."movementType" = 'OPENING'
);

INSERT INTO public."InventoryCostLedger"
  ("id", "productId", "location", "movementType", "quantity", "unitCost", "totalCost", "balanceQty", "balanceAvgCost", "notes", "createdAt")
SELECT
  'open-' || substr(md5(ds."productId" || 'DEPOT' || now()::text), 1, 24),
  ds."productId",
  'DEPOT',
  'OPENING',
  ds.quantity,
  ds."averageCost",
  ds.quantity * ds."averageCost",
  ds.quantity,
  ds."averageCost",
  'Saldo inicial WAC - Depósito',
  now()
FROM public."DepotStock" ds
WHERE NOT EXISTS (
  SELECT 1 FROM public."InventoryCostLedger" l
  WHERE l."productId" = ds."productId" AND l.location = 'DEPOT' AND l."movementType" = 'OPENING'
);

-- Classificação inicial do DRE para os lançamentos existentes.
UPDATE public."FinancialEntry"
SET
  "competenceDate" = COALESCE("competenceDate", "dueDate"),
  "entryKind" = CASE
    WHEN type = 'RECEIVABLE' THEN 'OTHER_REVENUE'
    WHEN lower(category) LIKE '%fornecedor%' THEN 'INVENTORY_PURCHASE'
    WHEN lower(COALESCE(description, '') || ' ' || COALESCE(notes, '')) ~ '(produtos?|coca|ambev|embev|eldorado|salgadinho|mercez)' THEN 'INVENTORY_PURCHASE'
    WHEN lower(COALESCE(description, '') || ' ' || COALESCE(notes, '')) ~ '(juros|multa|tarifa|financeir|cart[aã]o de cr[eé]dito)' THEN 'FINANCIAL'
    WHEN lower(COALESCE(description, '') || ' ' || COALESCE(notes, '')) ~ '(imposto|darf|simples nacional|icms|pis|cofins|tribut)' THEN 'TAX'
    ELSE 'OPERATING'
  END
WHERE "entryKind" IS NULL;

COMMIT;
