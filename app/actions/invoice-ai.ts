'use server'

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';

// Configurar o AI usando a versão estável
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "");

export async function parseInvoiceImage(formData: FormData) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
        throw new Error("API Key do Gemini não configurada!");
    }

    try {
        const file = formData.get('file') as File;
        if (!file) {
            throw new Error("Nenhuma imagem fornecida");
        }

        // 1. Salvar a imagem localmente
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Garantir que o diretório exista
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'nf');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const fileName = `nf-${Date.now()}-${file.name}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, buffer);

        const imageUrl = `/uploads/nf/${fileName}`;

        // 2. Processar a imagem com IA
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Converter file para o formato Gemini
        const mimeType = file.type;
        const inlineData = {
            data: buffer.toString("base64"),
            mimeType
        };

        const prompt = `Atua como um contabilista. Analisa esta nota fiscal (DANFE) e extrai os dados num formato JSON: fornecedor, cnpj, data, valor_total e uma lista 'itens' contendo (descricao, quantidade, preco_unitario, ncm).

Certifique-se de retornar APENAS um JSON válido estrito (sem formatações markdown \`\`\`json) seguindo exatamente este formato:
{
  "numero_nf": "12345", // deduza o numero da nota se houver
  "fornecedor": "Nome exato",
  "cnpj": "00.000.000/0000-00",
  "data": "2023-10-01",
  "valor_total": 1500.50,
  "itens": [
    {
      "descricao": "Nome do Produto",
      "quantidade": 10.5,
      "preco_unitario": 12.90,
      "ncm": "12345678"
    }
  ]
}`;

        const result = await model.generateContent([
            prompt,
            { inlineData }
        ]);

        const responseText = result.response.text();
        
        // Limpar possíveis blocos markdown do retorno JSON
        const cleanJsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        const data = JSON.parse(cleanJsonStr);

        return {
            success: true,
            imageUrl,
            data
        };

    } catch (error: any) {
        console.error("Erro ao analisar imagem:", error);
        return {
            success: false,
            error: error.message || "Falha ao processar imagem da nota fiscal"
        };
    }
}
