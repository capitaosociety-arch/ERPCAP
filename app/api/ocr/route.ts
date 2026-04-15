import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseAdmin } from "@/lib/supabase";

// 5. Configuração da IA usando a versão estável
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
            return NextResponse.json({ success: false, error: "Nenhuma imagem fornecida" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Upload para o Supabase Storage (Substitui o FS local para funcionar na Vercel)
        const fileName = `nf-${Date.now()}-${file.name.replace(/\s/g, '_')}`;
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('nf_uploads')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true
            });

        if (uploadError) {
            console.error("Erro no upload Supabase:", uploadError);
            // Se falhar o upload, continuamos processando a IA, mas sem URL persistente
        }

        const { data: publicUrlData } = supabaseAdmin.storage
            .from('nf_uploads')
            .getPublicUrl(fileName);

        const imageUrl = publicUrlData?.publicUrl || null;

        // 2. Rota de API: Setup Gemini 1.5 Flash (versão estável garantida)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const mimeType = file.type;
        const inlineData = {
            data: buffer.toString("base64"),
            mimeType,
        };

        // Enviar instrução exata: 'Extraia os dados desta nota fiscal para um JSON com: fornecedor, cnpj, data, total e uma lista de produtos (nome, quantidade, preco_unitario). Retorne APENAS o JSON puro'.
        const prompt = `Extraia os dados desta nota fiscal para um JSON com: fornecedor, cnpj, data, total e uma lista de produtos (nome, quantidade, preco_unitario). Retorne APENAS o JSON puro.`;

        const result = await model.generateContent([prompt, { inlineData }]);
        const responseText = result.response.text();
        
        // Limpar possíveis formatações para forçar JSON puro
        const cleanJsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const data = JSON.parse(cleanJsonStr);

        return NextResponse.json({
            success: true,
            imageUrl,
            data
        });

    } catch (error: any) {
        console.error("Erro na API OCR:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Falha ao processar a imagem OCR"
        }, { status: 500 });
    }
}
