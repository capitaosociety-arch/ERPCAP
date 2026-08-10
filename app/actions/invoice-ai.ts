'use server'

import { supabaseAdmin } from "@/lib/supabase";
import { isAIEnabled, extractJson } from "@/lib/ai/provider";
import { visionWithFallback } from "@/lib/ai/vision";

export async function parseInvoiceImage(formData: FormData) {
    if (!isAIEnabled()) {
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

        // 2. Processar a imagem com a camada de IA (retry + fallback de modelos)
        const prompt = `Extraia os dados desta nota fiscal para um JSON rigoroso com: 
        fornecedor, 
        cnpj, 
        numero_nf (procure por 'Número', 'Nº', 'NFe'),
        data (Data de Emissão no formato YYYY-MM-DD), 
        total (valor total da nota),
        e uma lista de 'produtos' (nome, quantidade, preco_unitario). 
        Retorne APENAS o JSON puro. Não inclua Markdown.`;

        const responseText = await visionWithFallback(prompt, { mimeType: file.type, data: buffer.toString("base64") });

        let resData;
        try {
            resData = extractJson(responseText);
        } catch {
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
