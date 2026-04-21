'use server'

import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseAdmin } from "@/lib/supabase";

// genAI is instantiated lazily inside functions to avoid build-time errors

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

        // 1. Upload para o Supabase Storage (Bucket notas-fiscais)
        const fileName = `nf-${Date.now()}-${file.name.replace(/\s/g, '_')}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from('notas-fiscais')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true
            });

        if (uploadError) {
            console.error("Erro no upload Supabase (Action):", uploadError);
        }

        const { data: publicUrlData } = supabaseAdmin.storage
            .from('notas-fiscais')
            .getPublicUrl(fileName);

        const imageUrl = publicUrlData?.publicUrl || null;

        // 2. Processar a imagem com IA (Gemini 1.5 Flash - Estável)
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Converter file para o formato Gemini
        const mimeType = file.type;
        const inlineData = {
            data: buffer.toString("base64"),
            mimeType
        };

        // 3. Prompt para extrair dados (Sincronizado)
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
        
        // Função robusta para extrair apenas o objeto JSON
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
