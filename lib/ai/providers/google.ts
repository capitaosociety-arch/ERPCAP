// ===========================================================================
// Provedor Google (Gemini) usando o SDK @google/generative-ai.
// Implementa a interface AIProvider (function calling nativo do Gemini).
// ===========================================================================

import { GoogleGenerativeAI, type FunctionDeclaration } from '@google/generative-ai';
import type { AIProvider, AIChatRequest, AIResponse, AIMessage, AIToolCall, AIToolParam } from '../types';
import { AIProviderError } from '../types';
import { sleep, isRateLimitError, isModelNotFoundError } from '../retry';

export class GoogleProvider implements AIProvider {
  readonly id = 'google';

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  private buildClient() {
    return new GoogleGenerativeAI(this.apiKey);
  }

  private toFunctionDeclarations(tools: AIToolParam[]): FunctionDeclaration[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters as any
    }));
  }

  private toContents(messages: AIMessage[]): any[] {
    const contents: any[] = [];
    for (const m of messages) {
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        contents.push({
          role: 'model',
          parts: m.toolCalls.map(tc => ({
            functionCall: { name: tc.name, args: tc.arguments }
          }))
        });
      } else if (m.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: m.toolName || '',
              response: { result: tryParseJson(m.content) }
            }
          }]
        });
      } else if (m.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: m.content || '' }] });
      } else {
        contents.push({ role: 'user', parts: [{ text: m.content }] });
      }
    }
    return contents;
  }

  private parseResponse(response: any): AIResponse {
    let text: string | null = null;
    try {
      text = response.text() || null;
    } catch {
      text = null;
    }

    const fns = response.functionCalls?.() || null;
    const toolCalls: AIToolCall[] | null = fns && fns.length > 0
      ? fns.map((fc: any, i: number) => ({
          id: fc.id || `fc-${i}`,
          name: fc.name,
          arguments: fc.args || {}
        }))
      : null;

    return { text, toolCalls };
  }

  async chat(req: AIChatRequest): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new AIProviderError('NO_KEY', 'Chave de API de IA não configurada (AI_API_KEY / GOOGLE_API_KEY).');
    }

    const genAI = this.buildClient();
    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: req.system,
      tools: req.tools && req.tools.length > 0 ? [{ functionDeclarations: this.toFunctionDeclarations(req.tools) }] : undefined,
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxOutputTokens ?? 2048
      }
    });

    const contents = this.toContents(req.messages);

    // Retry simples em rate limit
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await model.generateContent({ contents });
        return this.parseResponse(result.response);
      } catch (err: any) {
        if (isRateLimitError(err) && attempt < 3) {
          await sleep(2000 * attempt);
          continue;
        }
        if (isModelNotFoundError(err)) {
          throw new AIProviderError('NOT_FOUND', `Modelo "${this.model}" não encontrado para este provedor.`);
        }
        throw err;
      }
    }
    throw new Error('Falha na chamada ao provedor Google (Gemini).');
  }

  async vision(req: { prompt: string; image: { mimeType: string; data: string }; model?: string }): Promise<string> {
    if (!this.apiKey) {
      throw new AIProviderError('NO_KEY', 'Chave de API de IA não configurada (AI_API_KEY / GOOGLE_API_KEY).');
    }
    const genAI = this.buildClient();
    const model = genAI.getGenerativeModel({ model: req.model || this.model });
    const result = await model.generateContent([
      req.prompt,
      { inlineData: { mimeType: req.image.mimeType, data: req.image.data } }
    ]);
    return result.response.text();
  }
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
