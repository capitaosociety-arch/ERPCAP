import { NextResponse } from "next/server";
import { resolveAIEnv, maskKey } from "@/lib/ai/provider";

export const dynamic = 'force-dynamic';

// Endpoint de diagnóstico para identificar quais modelos IA estão disponíveis
export async function GET() {
    const env = resolveAIEnv();

    if (!env.apiKey) {
        return NextResponse.json({
            status: "ERROR",
            provider: env.provider,
            issue: "Nenhuma chave de IA configurada (AI_API_KEY / GOOGLE_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY).",
            fix: "Acesse o painel da Vercel → Settings → Environment Variables → Adicione a chave do provedor configurado em AI_PROVIDER."
        });
    }

    if (env.provider !== 'google') {
        return NextResponse.json({
            status: "INFO",
            provider: env.provider,
            model: env.model,
            apiKeyPresent: true,
            apiKeyPrefix: maskKey(env.apiKey),
            note: "Diagnóstico de lista de modelos disponível apenas para o provedor Google (Gemini)."
        });
    }

    const { GoogleProvider } = await import("@/lib/ai/providers/google");

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
            const provider = new GoogleProvider(env.apiKey, modelName);
            const res = await provider.chat({
                system: "",
                messages: [{ role: "user", content: "Responda apenas: ok" }]
            });
            results.push({ model: modelName, status: "✅ DISPONÍVEL", response: (res.text || "").trim().slice(0, 20) });
            break; // Para no primeiro que funcionar
        } catch (err: any) {
            const msg = err.message || "erro desconhecido";
            const code = err.code || "";
            const isQuota = code === 'RATE_LIMIT' || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
            const is404 = code === 'NOT_FOUND' || msg.includes('404') || msg.includes('not found');
            results.push({ 
                model: modelName, 
                status: is404 ? "❌ MODELO NÃO EXISTE" : isQuota ? "⚠️ QUOTA ESGOTADA" : "❌ ERRO", 
                error: msg.slice(0, 150)
            });
        }
    }

    return NextResponse.json({
        provider: env.provider,
        model: env.model,
        apiKeyPresent: true,
        apiKeyPrefix: maskKey(env.apiKey),
        results
    });
}
