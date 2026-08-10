// ===========================================================================
// Contratos normalizados da camada de IA — independente do provedor.
// O orquestrador (Copiloto) só conhece estes tipos; cada provedor traduz
// para o formato nativo da sua API (Gemini, Claude, futuro OpenAI etc.).
// ===========================================================================

export interface AIToolParam {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface AIToolCall {
  id: string; // id retornado pelo provedor (usado no feedback da ferramenta)
  name: string;
  arguments: Record<string, unknown>;
}

export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AIMessage {
  role: AIMessageRole;
  content: string;
  toolCalls?: AIToolCall[]; // presente em mensagens 'assistant' quando houve chamadas
  toolCallId?: string;      // presente em mensagens 'tool' (resposta da ferramenta)
  toolName?: string;
}

export interface AIChatRequest {
  system: string;
  messages: AIMessage[]; // histórico sem a mensagem de sistema
  tools?: AIToolParam[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AIResponse {
  text: string | null; // resposta final (null quando só houve chamadas de ferramenta)
  toolCalls: AIToolCall[] | null;
}

export interface AIVisionImage {
  mimeType: string;
  data: string; // base64
}

export interface AIProvider {
  readonly id: string;
  chat(req: AIChatRequest): Promise<AIResponse>;
  /** Visão (imagem -> texto). Provedores sem suporte devem lançar erro claro. */
  vision?(req: { prompt: string; image: AIVisionImage; model?: string }): Promise<string>;
}

export class AIProviderError extends Error {
  code: 'NO_KEY' | 'RATE_LIMIT' | 'NOT_FOUND' | 'PARSE' | 'UNSUPPORTED' | 'UNKNOWN';
  constructor(code: AIProviderError['code'], message: string) {
    super(message);
    this.code = code;
  }
}
