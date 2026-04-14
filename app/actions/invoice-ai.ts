'use server'

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';

// Configurar o AI
const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function parseInvoiceImage(formData: FormData) {
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

        const prompt = `
Você é um especialista em ler Notas Fiscais (NFe / Cupons). 
Analise esta imagem da nota fiscal e extraia os itens comprados, a quantidade, o valor unitário e o número da nota.

Retorne APENAS um JSON válido estrito (sem formatações markdown \`\`\`json) neste formato:
{
  "documentNumber": "12345", // número do documento ou nota fiscal
  "items": [
    {
      "name": "Nome exato do Produto na Nota",
      "quantity": 10.5,
      "unitPrice": 12.90
    }
  ]
}
Caso algo não possa ser lido, deduza da melhor forma ou gere os dados que conseguir.
`;

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
