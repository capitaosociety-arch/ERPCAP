-- CreateTable
CREATE TABLE "OccupationSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "capacidadeFut5" INTEGER NOT NULL DEFAULT 2,
    "capacidadeFut7" INTEGER NOT NULL DEFAULT 1,
    "abertura" INTEGER NOT NULL DEFAULT 6,
    "fechamento" INTEGER NOT NULL DEFAULT 24,
    "ociosoLimite" INTEGER NOT NULL DEFAULT 25,
    "saudavelLimite" INTEGER NOT NULL DEFAULT 50,
    "altaDemandaLimite" INTEGER NOT NULL DEFAULT 80,
    "saturadoLimite" INTEGER NOT NULL DEFAULT 95,
    "diasAvaliacaoElasticidade" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OccupationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingBand" (
    "id" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "minPrice" DOUBLE PRECISION NOT NULL,
    "maxPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationHistory" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "diaSemana" TEXT,
    "horaInicio" INTEGER,
    "horaFim" INTEGER,
    "categoria" TEXT NOT NULL,
    "precoAtual" DOUBLE PRECISION NOT NULL,
    "precoSugerido" DOUBLE PRECISION NOT NULL,
    "nivelConfianca" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT NOT NULL,
    "periodoRef" TEXT NOT NULL,
    "decisao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "decisaoNota" TEXT,
    "adminId" TEXT,
    "precoAplicado" DOUBLE PRECISION,
    "periodoTesteDias" INTEGER,
    "resultado" TEXT,
    "resultadoNota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "precoAnterior" DOUBLE PRECISION NOT NULL,
    "precoNovo" DOUBLE PRECISION NOT NULL,
    "autorId" TEXT NOT NULL,
    "ocupacaoAntes" DOUBLE PRECISION,
    "receitaAntes" DOUBLE PRECISION,
    "consumoBarAntes" DOUBLE PRECISION,
    "ocupacaoDepois" DOUBLE PRECISION,
    "receitaDepois" DOUBLE PRECISION,
    "consumoBarDepois" DOUBLE PRECISION,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'EM_AVALIACAO',
    "resultado" TEXT,
    "nota" TEXT,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingBand_campo_startHour_endHour_key" ON "PricingBand"("campo", "startHour", "endHour");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationHistory_fingerprint_key" ON "RecommendationHistory"("fingerprint");

-- CreateIndex
CREATE INDEX "RecommendationHistory_decisao_idx" ON "RecommendationHistory"("decisao");

-- CreateIndex
CREATE INDEX "RecommendationHistory_campo_idx" ON "RecommendationHistory"("campo");

-- CreateIndex
CREATE INDEX "RecommendationHistory_adminId_idx" ON "RecommendationHistory"("adminId");

-- CreateIndex
CREATE INDEX "PriceChange_campo_startHour_endHour_idx" ON "PriceChange"("campo", "startHour", "endHour");

-- CreateIndex
CREATE INDEX "PriceChange_appliedAt_idx" ON "PriceChange"("appliedAt");

-- CreateIndex
CREATE INDEX "PriceChange_autorId_idx" ON "PriceChange"("autorId");

-- AddForeignKey
ALTER TABLE "RecommendationHistory" ADD CONSTRAINT "RecommendationHistory_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
