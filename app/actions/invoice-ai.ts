'use server'

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';

// Configurar o AI usando a versão mais recente e estável
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

        const buffer = Buffer.from(await file.arrayBuffer());

        // 2. Processar a imagem com IA (Gemini Flash - Sempre o mais recente)
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        
        // Converter file para o formato Gemini
        const mimeType = file.type;
        const inlineData = {
            data: buffer.toString("base64"),
            mimeType
        };

        // 3. Prompt para extrair dados (Sincronizado com a Rota de API)
        const prompt = `Extraia os dados desta nota fiscal para um JSON rigoroso com: 
        fornecedor, 
        cnpj, 
        numero_nf (procure por 'Número', 'Nº', 'NFe'),
        data (Data de Emissão no formato YYYY-MM-DD), 
        total (valor total da nota),
        e uma lista de 'produtos' (nome, quantidade, preco_unitario). 
        Retorne APENAS o JSON puro. Não inclua Markdown.`;

        const result = await model.generateContent([
            prompt,
            { inlineData }
        ]);

        const responseText = result.response.text();
        
        // Função robusta para extrair apenas o objeto JSON do meio do texto
        const extractJson = (text: string) => {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                return text.substring(start, end + 1);
            }
            return text;
        };

        const cleanJsonStr = extractJson(responseText.replace(/```json/g, "").replace(/```/g, "").trim());
        
        let resData;
        try {
            resData = JSON.parse(cleanJsonStr);
        } catch (parseError) {
            console.error("Erro ao processar JSON da IA:", responseText);
            throw new Error("A IA retornou um formato inválido. Tente novamente.");
        }

        // A URL da imagem para o frontend consumir (se for o caso)
        const imageUrl = `/uploads/nf/${Date.now()}_${file.name.replace(/\s/g, '_')}`;

        return {
            success: true,
            imageUrl,
            data: resData
        };

    } catch (error: any) {
        console.error("Erro no processamento da IA:", error);
        return {
            success: false,
            error: error.message || "Erro desconhecido ao processar nota fiscal"
        };
    }
}
