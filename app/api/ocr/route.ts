import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAIEnabled, extractJson } from "@/lib/ai/provider";
import { visionWithFallback } from "@/lib/ai/vision";

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    if (!isAIEnabled()) {
        return NextResponse.json({ success: false, error: "Chave GOOGLE_API_KEY não configurada!" }, { status: 500 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        
        if (!file) {
            return NextResponse.json({ success: false, error: "Nenhuma imagem fornecida." }, { status: 400 });
        }

        // Verificar tamanho do arquivo (limite de 20MB)
        const maxSize = 20 * 1024 * 1024;
        if (file.size > maxSize) {
            return NextResponse.json({ 
                success: false, 
                error: `Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Use uma foto com resolução menor. Limite: 20MB.` 
            }, { status: 413 });
        }

        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            return NextResponse.json({ 
                success: false, 
                error: "Formato inválido. Envie uma imagem (JPG, PNG, WEBP) ou PDF." 
            }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Upload para o Supabase Storage
        const fileName = `nf-${Date.now()}-${file.name.replace(/\s/g, '_')}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from('notas-fiscais')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true
            });

        if (uploadError) {
            console.error("Erro no upload Supabase:", uploadError);
        }

        const { data: publicUrlData } = supabaseAdmin.storage
            .from('notas-fiscais')
            .getPublicUrl(fileName);

        const imageUrl = publicUrlData?.publicUrl || null;

        const prompt = `Extraia os dados desta nota fiscal para um JSON rigoroso com: 
        fornecedor, 
        cnpj, 
        numero_nf (procure por 'Número', 'Nº', 'NFe'),
        data (DATA DE EMISSÃO da nota, no formato YYYY-MM-DD), 
        total (valor total da nota),
        e uma lista de 'produtos' (nome, quantidade, preco_unitario). 
        Retorne APENAS o JSON puro. Não inclua Markdown.`;

        // Chamar IA com retry automático e fallback de modelos
        const responseText = await visionWithFallback(prompt, { mimeType: file.type, data: buffer.toString("base64") });

        let data;
        try {
            data = extractJson(responseText);
        } catch {
            console.error("Erro ao processar JSON da IA:", responseText);
            throw new Error("A IA retornou um formato inválido. Tente tirar uma foto mais nítida.");
        }

        return NextResponse.json({ success: true, imageUrl, data });

    } catch (error: any) {
        const msg = error.message || "Falha ao processar a imagem";
        console.error("Erro na API OCR:", msg);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
