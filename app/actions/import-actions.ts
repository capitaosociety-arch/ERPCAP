'use server'

import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../../lib/prisma";
import { revalidatePath } from "next/cache";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

export async function processProductsWithAI(rawData: any[]) {
    if (!rawData || rawData.length === 0) {
        throw new Error("Nenhum dado encontrado na planilha.");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    // Preparar dados para a IA (enviar apenas uma amostra significativa para mapeamento ou o lote todo se pequeno)
    const sample = rawData.slice(0, 100); 
    const prompt = `Analise estes dados brutos de uma planilha e transforme-os em um array de objetos JSON para cadastro de produtos.
    Os campos devem ser:
    - name: Nome do produto (string)
    - price: Preço de venda (number)
    - cost: Preço de custo (number)
    - unit: Unidade (string curta, padrão 'UN')
    - categoryName: Nome da categoria (string)

    Dados da Planilha:
    ${JSON.stringify(sample)}

    REGRAS:
    - Retorne APENAS o JSON puro.
    - Se o preço ou custo tiverem vírgula, converta para número (ponto).
    - Se não houver categoria, use 'Geral'.
    - Seja rigoroso com os tipos de dados.`;

    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        // Extração de JSON robusta
        const extractJson = (text: string) => {
            const start = text.indexOf('[');
            const end = text.lastIndexOf(']');
            if (start !== -1 && end !== -1) {
                return text.substring(start, end + 1);
            }
            return text;
        };

        const cleanJson = extractJson(responseText.replace(/```json/g, "").replace(/```/g, "").trim());
        return { success: true, data: JSON.parse(cleanJson) };
    } catch (error: any) {
        console.error("Erro no processamento da IA para Excel:", error);
        throw new Error("Não foi possível interpretar a planilha com IA.");
    }
}

export async function saveBatchProducts(products: any[]) {
    if (!products || !Array.isArray(products)) {
        throw new Error("Lista de produtos inválida.");
    }

    try {
        await prisma.$transaction(async (tx) => {
            for (const p of products) {
                // 1. Resolver categoria (busca ou cria)
                let category = await tx.productCategory.findFirst({
                    where: { OR: [
                        { name: { equals: p.categoryName, mode: 'insensitive' } },
                        { name: { equals: 'Geral' } }
                    ]}
                });

                if (!category && p.categoryName) {
                    category = await tx.productCategory.create({
                        data: { name: p.categoryName }
                    });
                } else if (!category) {
                    category = await tx.productCategory.create({
                        data: { name: 'Geral' }
                    });
                }

                // 2. Upsert do Produto (evita duplicatas pelo nome se necessário, ou sempre cria novo)
                // Aqui vamos usar create para garantir que todos entrem, ou upsert se o usuário preferir atualizar.
                // Por padrão, vamos criar novos para não sobrescrever dados existentes acidentalmente sem avisar.
                await tx.product.create({
                    data: {
                        name: p.name,
                        categoryId: category.id,
                        price: Number(p.price) || 0,
                        cost: Number(p.cost) || 0,
                        unit: (p.unit || 'UN').substring(0, 2).toUpperCase(),
                        iconUrl: '📦',
                        isActive: true
                    }
                });
            }
        });

        revalidatePath("/produtos");
        revalidatePath("/pdv");
        return { success: true };
    } catch (error: any) {
        console.error("Erro ao salvar lote de produtos:", error);
        throw new Error("Erro ao salvar os produtos no banco de dados.");
    }
}
