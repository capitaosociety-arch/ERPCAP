import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseAdmin } from "@/lib/supabase";

// Aumentar o limite de payload da API para aceitar fotos de celular (até 20MB)
export const config = {
    api: {
        bodyParser: false,
    },
};

export const maxDuration = 60; // Timeout de 60s para o processamento da IA

// Configuração da IA usando a versão estável
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "");

export async function POST(req: NextRequest) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
        return NextResponse.json({ success: false, error: "Chave GOOGLE_API_KEY não configurada!" }, { status: 500 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        
        if (!file) {
            return NextResponse.json({ success: false, error: "Nenhuma imagem fornecida." }, { status: 400 });
        }

        // Verificar tamanho do arquivo (limite de 20MB)
        const maxSize = 20 * 1024 * 1024; // 20MB
        if (file.size > maxSize) {
            return NextResponse.json({ 
                success: false, 
                error: `Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Use uma foto com resolução menor ou comprima antes de enviar. Limite: 20MB.` 
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

        // Upload para o Supabase Storage (Substitui o FS local para funcionar na Vercel)
        const fileName = `nf-${Date.now()}-${file.name.replace(/\s/g, '_')}`;
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('notas-fiscais')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true
            });

        if (uploadError) {
            console.error("Erro no upload Supabase:", uploadError);
            // Se falhar o upload, continuamos processando a IA, mas sem URL persistente
        }

        const { data: publicUrlData } = supabaseAdmin.storage
            .from('notas-fiscais')
            .getPublicUrl(fileName);

        const imageUrl = publicUrlData?.publicUrl || null;

        // 2. Rota de API: Setup Gemini Flash (versão estável gemini-1.5-flash)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const mimeType = file.type;
        const inlineData = {
            data: buffer.toString("base64"),
            mimeType,
        };

        // Enviar instrução exata para captura de metadados e itens
        const prompt = `Extraia os dados desta nota fiscal para um JSON rigoroso com: 
        fornecedor, 
        cnpj, 
        numero_nf (procure por 'Número', 'Nº', 'NFe'),
        data (Data de Emissão no formato YYYY-MM-DD), 
        total (valor total da nota),
        e uma lista de 'produtos' (nome, quantidade, preco_unitario). 
        Retorne APENAS o JSON puro. Não inclua Markdown.`;

        const result = await model.generateContent([prompt, { inlineData }]);
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
        
        let data;
        try {
            data = JSON.parse(cleanJsonStr);
        } catch (parseError) {
            console.error("Erro ao processar JSON da IA:", responseText);
            throw new Error("A IA retornou um formato inválido. Tente tirar uma foto melhor.");
        }

        return NextResponse.json({
            success: true,
            imageUrl,
            data
        });

    } catch (error: any) {
        const msg = error.message || "Falha ao processar a imagem";
        console.error("Erro na API OCR:", msg);
        
        // Traduzir erros comuns da API do Gemini
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
            return NextResponse.json({ success: false, error: "Limite da API atingido. Tente novamente em instantes." }, { status: 429 });
        }
        if (msg.includes('INVALID_ARGUMENT') || msg.includes('inlineData')) {
            return NextResponse.json({ success: false, error: "Imagem inválida ou corrompida. Tente novamente com outra foto." }, { status: 400 });
        }
        if (msg.includes('SAFETY')) {
            return NextResponse.json({ success: false, error: "A imagem foi bloqueada por filtro de segurança. Tente com outra foto." }, { status: 400 });
        }

        return NextResponse.json({
            success: false,
            error: msg
        }, { status: 500 });
    }
}
