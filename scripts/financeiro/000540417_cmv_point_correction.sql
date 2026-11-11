-- Correção pontual da NF 000540417 — NÃO EXECUTAR SEM AUTORIZAÇÃO.
-- Atualiza apenas 31 snapshots de venda e o custo atual de Coca-Cola/Heineken.
-- Idempotente: se já estiver corrigido, não altera nem duplica auditoria.
-- Não altera quantidades, pedidos, pagamentos, PriceHistory ou documentos fiscais.
\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _cmv_targets (
  id text PRIMARY KEY,
  product text NOT NULL,
  old_cost double precision NOT NULL,
  new_cost double precision NOT NULL,
  reason text NOT NULL
) ON COMMIT DROP;

INSERT INTO _cmv_targets (id, product, old_cost, new_cost, reason) VALUES
  ('cmw4f6j4c000jkw04mjrrrwz8', 'Coca-Cola 1,5L', 7735, 6.557857, 'PH 000538014 - saldo Balcao'),
  ('cmw4fagja001hkw04sg3csjq8', 'Coca-Cola 1,5L', 7735, 6.557857, 'PH 000538014 - saldo Balcao'),
  ('cmw4fmn1u0003l5045vyp20cc', 'Coca-Cola 1,5L', 7735, 6.557857, 'PH 000538014 - saldo Balcao'),
  ('cmw4frr5s000hl504hj0glft3', 'Coca-Cola 1,5L', 7735, 6.557857, 'PH 000538014 - saldo Balcao'),
  ('cmw4fy6i30013l504yxndvgad', 'Coca-Cola 1,5L', 7735, 6.557857, 'PH 000538014 - saldo Balcao'),
  ('cmw4fybdx0015l5042kx6mcnd', 'Coca-Cola 1,5L', 7735, 6.557857, 'PH 000538014 - saldo Balcao'),
  ('cmw4fyfcm0017l504ycrhtnn6', 'Coca-Cola 1,5L', 7735, 6.557857, 'PH 000538014 - saldo Balcao'),
  ('cmw4fyket0019l504sjyck5wb', 'Coca-Cola 1,5L', 7735, 6.557857, 'PH 000538014 - saldo Balcao'),
  ('cmw4g7u8t002ll504zfg7mndj', 'Coca-Cola 1,5L', 7735, 6.557857, 'PH 000538014 - saldo Balcao'),
  ('cmw5yxaks0003l9047jivxw78', 'Coca-Cola 1,5L', 7735, 7.7353, 'NF 000540417 - transferencia Deposito'),
  ('cmw606kyu000zl904o8j99kbt', 'Coca-Cola 1,5L', 7735, 7.7353, 'NF 000540417 - transferencia Deposito'),
  ('cmw60a5pr001zif04gndkf442', 'Coca-Cola 1,5L', 7735, 7.7353, 'NF 000540417 - transferencia Deposito'),
  ('cmw61vz660003l504zzn2rlb8', 'Coca-Cola 1,5L', 7735, 7.7353, 'NF 000540417 - transferencia Deposito'),
  ('cmw61x8gn0005l504lfwc5rc6', 'Coca-Cola 1,5L', 7735, 7.7353, 'NF 000540417 - transferencia Deposito'),
  ('cmw74l2kx000rl804zvxjwprd', 'Coca-Cola 1,5L', 7735, 7.7353, 'NF 000540417 - transferencia Deposito'),
  ('cmw74ojj7001jl804qs79qxt4', 'Coca-Cola 1,5L', 7735, 7.7353, 'NF 000540417 - transferencia Deposito'),
  ('cmw5zkssi000njo04h9ea2pz6', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zlcbw000rjo04fdc7g5cg', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zlhjk000ji504x875wzxw', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zmcns000nif04616xd3wf', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5znzs4000pif049m9ijbl4', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zo3hp000rif04q1nc04fi', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zoamm000li50469cwu1c6', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zoftl000ni504b5affywk', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zome3000pi504xbn8stj2', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zopyd000ri504c08t262b', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zowx1000ti504uroposqc', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zp1l1000vjo041xsfy98i', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zpc3o000tif048b523s8r', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zpg8d000vi5042lfn61px', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao'),
  ('cmw5zpmrr000rl904t3froyln', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao');

DO $$
DECLARE
  total int;
  missing int;
  old_count int;
  new_count int;
  divergent int;
BEGIN
  SELECT count(*) INTO total FROM _cmv_targets;
  IF total <> 31 THEN
    RAISE EXCEPTION 'Esperados 31 alvos, encontrados %', total;
  END IF;

  SELECT count(*) INTO missing
  FROM _cmv_targets t
  LEFT JOIN public."StockMovement" sm ON sm.id = t.id
  WHERE sm.id IS NULL;

  IF missing > 0 THEN
    RAISE EXCEPTION '% snapshots nao encontrados', missing;
  END IF;

  SELECT
    count(*) FILTER (WHERE sm."unitCost" = t.old_cost),
    count(*) FILTER (WHERE sm."unitCost" = t.new_cost)
  INTO old_count, new_count
  FROM _cmv_targets t
  JOIN public."StockMovement" sm ON sm.id = t.id;

  divergent := total - old_count - new_count;
  IF divergent > 0 THEN
    RAISE EXCEPTION '% snapshots com custo divergente; abortando', divergent;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."Product"
    WHERE id = 'cmo1qf1fv001bl404g4rabsgd' AND cost NOT IN (7.97, 7.7353)
  ) OR EXISTS (
    SELECT 1 FROM public."Product"
    WHERE id = 'cmo1qf1o9002pl404zr85cy99' AND cost NOT IN (5.66, 4.88)
  ) THEN
    RAISE EXCEPTION 'Custo atual de produto divergente do esperado; abortando';
  END IF;
END $$;

CREATE TEMP TABLE _cmv_changed AS
SELECT t.*, sm.quantity, sm.date, sm."unitCost" AS current_cost
FROM _cmv_targets t
JOIN public."StockMovement" sm ON sm.id = t.id
WHERE sm."unitCost" = t.old_cost;

UPDATE public."StockMovement" sm
SET "unitCost" = t.new_cost
FROM _cmv_targets t
WHERE sm.id = t.id AND sm."unitCost" = t.old_cost;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _cmv_targets t
    JOIN public."StockMovement" sm ON sm.id = t.id
    WHERE sm."unitCost" = t.old_cost
  ) THEN
    RAISE EXCEPTION 'Ainda existem snapshots com custo antigo; rollback';
  END IF;
END $$;

INSERT INTO public."AuditLog" ("id", "userId", action, details, "timestamp")
SELECT
  'cmvfix-' || substr(md5(c.id || clock_timestamp()::text), 1, 24),
  'cmo05wmct0000k304m0bt19jp',
  'Correção pontual CMV NF 000540417',
  format('%s | %s | qtd %s | %s -> %s | %s',
    c.product, c.id, c.quantity, c.current_cost, c.new_cost, c.reason),
  now()
FROM _cmv_changed c;

CREATE TEMP TABLE _product_before AS
SELECT id, name, cost
FROM public."Product"
WHERE id IN ('cmo1qf1fv001bl404g4rabsgd', 'cmo1qf1o9002pl404zr85cy99');

UPDATE public."Product" p
SET cost = v.new_cost
FROM (VALUES
  ('cmo1qf1fv001bl404g4rabsgd', 7.97::double precision, 7.7353::double precision),
  ('cmo1qf1o9002pl404zr85cy99', 5.66::double precision, 4.88::double precision)
) AS v(id, old_cost, new_cost)
WHERE p.id = v.id AND p.cost = v.old_cost;

INSERT INTO public."AuditLog" ("id", "userId", action, details, "timestamp")
SELECT
  'cmvfix-' || substr(md5(p.id || clock_timestamp()::text), 1, 24),
  'cmo05wmct0000k304m0bt19jp',
  'Correção pontual custo NF 000540417',
  format('%s | custo atual %s -> %s | NF 000540417', p.name, b.cost, p.cost),
  now()
FROM public."Product" p
JOIN _product_before b ON b.id = p.id
WHERE p.cost <> b.cost;

COMMIT;

\echo 'Correção aplicada (ou já idempotente). Validar com 000540417_cmv_point_validate.sql.'
