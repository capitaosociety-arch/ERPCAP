import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = 'force-dynamic';

// Endpoint de diagnóstico para identificar quais modelos IA estão disponíveis
export async function GET() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
    
    if (!apiKey) {
        return NextResponse.json({
            status: "ERROR",
            issue: "GOOGLE_API_KEY não está configurada no ambiente de produção (Vercel).",
            fix: "Acesse o painel da Vercel → Settings → Environment Variables → Adicione GOOGLE_API_KEY com o valor da sua chave do Google AI Studio."
        });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    const modelsToTest = [
        "gemini-2.5-flash-preview-04-17",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash",
    ];

    const results: any[] = [];

    for (const modelName of modelsToTest) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            // Teste simples com texto apenas (rápido e sem cota de imagem)
            const result = await model.generateContent("Responda apenas: ok");
            const text = result.response.text();
            results.push({ model: modelName, status: "✅ DISPONÍVEL", response: text.trim().slice(0, 20) });
            break; // Para no primeiro que funcionar
        } catch (err: any) {
            const msg = err.message || "erro desconhecido";
            const isQuota = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
            const is404 = msg.includes('404') || msg.includes('not found');
            results.push({ 
                model: modelName, 
                status: is404 ? "❌ MODELO NÃO EXISTE" : isQuota ? "⚠️ QUOTA ESGOTADA" : "❌ ERRO", 
                error: msg.slice(0, 150)
            });
        }
    }

    return NextResponse.json({
        apiKeyPresent: true,
        apiKeyPrefix: apiKey.slice(0, 10) + "...",
        results
    });
}
