-- Validação READ-ONLY pós-correção da NF 000540417.
-- Não altera dados. Execute depois da correção autorizada.
\set ON_ERROR_STOP on

with targets(id, old_cost, new_cost) as (
  values
    ('cmw4f6j4c000jkw04mjrrrwz8', 7735::double precision, 6.557857::double precision),
    ('cmw4fagja001hkw04sg3csjq8', 7735, 6.557857),
    ('cmw4fmn1u0003l5045vyp20cc', 7735, 6.557857),
    ('cmw4frr5s000hl504hj0glft3', 7735, 6.557857),
    ('cmw4fy6i30013l504yxndvgad', 7735, 6.557857),
    ('cmw4fybdx0015l5042kx6mcnd', 7735, 6.557857),
    ('cmw4fyfcm0017l504ycrhtnn6', 7735, 6.557857),
    ('cmw4fyket0019l504sjyck5wb', 7735, 6.557857),
    ('cmw4g7u8t002ll504zfg7mndj', 7735, 6.557857),
    ('cmw5yxaks0003l9047jivxw78', 7735, 7.7353),
    ('cmw606kyu000zl904o8j99kbt', 7735, 7.7353),
    ('cmw60a5pr001zif04gndkf442', 7735, 7.7353),
    ('cmw61vz660003l504zzn2rlb8', 7735, 7.7353),
    ('cmw61x8gn0005l504lfwc5rc6', 7735, 7.7353),
    ('cmw74l2kx000rl804zvxjwprd', 7735, 7.7353),
    ('cmw74ojj7001jl804qs79qxt4', 7735, 7.7353),
    ('cmw5zkssi000njo04h9ea2pz6', 5.66, 4.0),
    ('cmw5zlcbw000rjo04fdc7g5cg', 5.66, 4.0),
    ('cmw5zlhjk000ji504x875wzxw', 5.66, 4.0),
    ('cmw5zmcns000nif04616xd3wf', 5.66, 4.0),
    ('cmw5znzs4000pif049m9ijbl4', 5.66, 4.0),
    ('cmw5zo3hp000rif04q1nc04fi', 5.66, 4.0),
    ('cmw5zoamm000li50469cwu1c6', 5.66, 4.0),
    ('cmw5zoftl000ni504b5affywk', 5.66, 4.0),
    ('cmw5zome3000pi504xbn8stj2', 5.66, 4.0),
    ('cmw5zopyd000ri504c08t262b', 5.66, 4.0),
    ('cmw5zowx1000ti504uroposqc', 5.66, 4.0),
    ('cmw5zp1l1000vjo041xsfy98i', 5.66, 4.0),
    ('cmw5zpc3o000tif048b523s8r', 5.66, 4.0),
    ('cmw5zpg8d000vi5042lfn61px', 5.66, 4.0),
    ('cmw5zpmrr000rl904t3froyln', 5.66, 4.0)
),
checked as (
  select t.*, sm.id as movement_id, sm."unitCost" as current_cost
  from targets t
  left join public."StockMovement" sm on sm.id = t.id
)
select
  count(*) as total,
  count(*) filter (where movement_id is null) as ausentes,
  count(*) filter (where current_cost = new_cost) as corrigidos,
  count(*) filter (where current_cost = old_cost) as ainda_originais,
  count(*) filter (where current_cost is distinct from old_cost and current_cost is distinct from new_cost) as divergentes
from checked;

select id, name, cost
from public."Product"
where id in ('cmo1qf1fv001bl404g4rabsgd', 'cmo1qf1o9002pl404zr85cy99')
order by name;

select count(*) as auditorias
from public."AuditLog"
where action in ('Correção pontual CMV NF 000540417', 'Correção pontual custo NF 000540417');

select
  round(sum((sm.quantity * coalesce(sm."unitCost", 0))::numeric), 2) as cmv_novembro_atual
from public."StockMovement" sm
where sm.type = 'OUT_SALE'
  and to_char(sm.date - interval '4 hours', 'YYYY-MM') = '2026-11';
