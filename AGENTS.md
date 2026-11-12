# Diretrizes permanentes

- Usar exclusivamente a infraestrutura existente de producao (Supabase e Vercel). Nao criar projetos, bancos ou ambientes alternativos.
- Nao executar PostgreSQL local, Next.js local, Docker ou ambiente local de testes.
- Validar alteracoes por analise estatica, typecheck, lint e testes puros que nao dependam de banco/servidor.
- Preparar alteracoes de banco como migracoes SQL reversiveis, prontas para publicacao conjunta.
- Nao executar migracao, commit, push, deploy ou alteracao em producao sem autorizacao expressa.
- Antes de alteracao estrutural em producao: verificar dependencias/integridade, gerar backup verificado e definir rollback.
- Preservar PDV, Comandas, Estoque, Financeiro, DRE, fechamentos, snapshots e historico. Nao recalcular periodos fechados nem alterar valores financeiros historicos.
- Depois de autorizacao: publicar na producao existente e executar testes funcionais controlados, sem lancamentos ficticios ou alteracoes indevidas de dados reais.
- Nao assumir custos, margens, rateios ou classificacoes sem evidencia. Informar limitacoes e dados ausentes.
