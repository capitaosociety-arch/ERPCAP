import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

// 5. Variável: Use a variável de ambiente GOOGLE_API_KEY para a autenticação (cai para GEMINI_API_KEY como fallback).
const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: NextRequest) {
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

        // Opcional: Salvar histórico de notas para auditoria, mantendo o fallback que tínhamos
        const uploadDir = path.join(process.cwd(), "public", "uploads", "nf");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const fileName = `nf-ocr-${Date.now()}-${file.name}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, buffer);
        const imageUrl = `/uploads/nf/${fileName}`;

        // 2. Rota de API: Setup Gemini 1.5 Flash
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
