import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Modelos ordenados por prioridade (mais estável primeiro)
const MODELS_FALLBACK = [
    "gemini-2.5-flash-preview-04-17", // Preview datado de Abril 2026 - confirmado funcional
    "gemini-2.5-flash",               // Versão estável 2.5
    "gemini-2.5-pro",                 // Pro 2.5 (maior cota de entrada)
    "gemini-2.5-flash-lite",          // Lite sem data de preview
    "gemini-1.5-pro-latest",          // Fallback legado Pro
    "gemini-1.5-flash-002",           // Variante 002 legada
];

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "");

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Tenta gerar conteúdo com retry automático e fallback de modelos
async function generateWithRetry(buffer: Buffer, mimeType: string, prompt: string): Promise<string> {
    for (let modelIdx = 0; modelIdx < MODELS_FALLBACK.length; modelIdx++) {
        const modelName = MODELS_FALLBACK[modelIdx];
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`Tentando modelo: ${modelName}, tentativa ${attempt}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const inlineData = { data: buffer.toString("base64"), mimeType };
                const result = await model.generateContent([prompt, { inlineData }]);
                return result.response.text();
            } catch (err: any) {
                const msg = err.message || "";
                const isRateLimit = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
                const isNotFound = msg.includes('404') || msg.includes('not found');
                
                if (isNotFound) {
                    // Modelo não existe, tentar o próximo imediatamente
                    console.warn(`Modelo ${modelName} não encontrado, tentando próximo...`);
                    break;
                }
                
                if (isRateLimit && attempt < 3) {
                    // Esperar progressivamente antes de tentar novamente
                    const waitMs = attempt * 3000; // 3s, 6s
                    console.warn(`Rate limit no modelo ${modelName}. Aguardando ${waitMs}ms...`);
                    await sleep(waitMs);
                    continue;
                }
                
                if (attempt === 3 || !isRateLimit) {
                    // Se foi o último attempt ou não é rate limit, tentar próximo modelo
                    console.warn(`Falha no modelo ${modelName}:`, msg);
                    break;
                }
            }
        }
    }
    
    throw new Error("Todos os modelos de IA falharam. Verifique sua chave de API ou tente novamente em alguns minutos.");
}

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
        data (Data de Emissão no formato YYYY-MM-DD), 
        total (valor total da nota),
        e uma lista de 'produtos' (nome, quantidade, preco_unitario). 
        Retorne APENAS o JSON puro. Não inclua Markdown.`;

        // Chamar IA com retry automático e fallback de modelos
        const responseText = await generateWithRetry(buffer, file.type, prompt);
        
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
            throw new Error("A IA retornou um formato inválido. Tente tirar uma foto mais nítida.");
        }

        return NextResponse.json({ success: true, imageUrl, data });

    } catch (error: any) {
        const msg = error.message || "Falha ao processar a imagem";
        console.error("Erro na API OCR:", msg);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
