-- Validação READ-ONLY dos alvos da correção pontual da NF 000540417.
-- Não altera dados. Pode ser executado antes da correção.
\set ON_ERROR_STOP on

with targets(id, product, old_cost, new_cost, reason) as (
  values
    ('cmw4f6j4c000jkw04mjrrrwz8', 'Coca-Cola 1,5L', 7735::double precision, 6.557857::double precision, 'PH 000538014 - saldo Balcao'),
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
    ('cmw5zpg8d000vi5042lfn61px', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao')
    ,('cmw5zpmrr000rl904t3froyln', 'Heineken Lata 269ml', 5.66, 4.0, 'PH 14/09 - saldo Balcao')
),
checked as (
  select t.*, sm.id as movement_id, sm.quantity, sm."unitCost" as current_cost
  from targets t
  left join public."StockMovement" sm on sm.id = t.id
)
select
  count(*) as total_alvos,
  count(*) filter (where movement_id is null) as ausentes,
  count(*) filter (where current_cost = old_cost) as ainda_originais,
  count(*) filter (where current_cost = new_cost) as ja_corrigidos,
  count(*) filter (where current_cost is distinct from old_cost and current_cost is distinct from new_cost) as divergentes,
  round(sum(case when current_cost = old_cost then quantity * (new_cost - old_cost) else 0 end)::numeric, 2) as delta_pendente
from checked;
