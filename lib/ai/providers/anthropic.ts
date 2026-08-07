// ===========================================================================
// Provedor Anthropic (Claude) via chamada HTTP direta à API /v1/messages.
// Nenhuma dependência extra: o contrato da camada é o mesmo do Gemini.
// ===========================================================================

import type { AIProvider, AIChatRequest, AIResponse, AIMessage, AIToolCall } from '../types';
import { AIProviderError } from '../types';
import { sleep } from '../retry';

const API_URL = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: string;
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  private async request(body: Record<string, unknown>): Promise<any> {
    if (!this.apiKey) {
      throw new AIProviderError('NO_KEY', 'Chave de API do Claude (ANTHROPIC_API_KEY) não configurada.');
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': VERSION,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        return await res.json();
      }

      const text = await res.text();
      const msg = `${res.status}: ${text.slice(0, 300)}`;

      if (res.status === 429 || res.status === 529) {
        if (attempt < 3) {
          await sleep(2000 * attempt);
          continue;
        }
        throw new AIProviderError('RATE_LIMIT', 'Limite de requisições do Claude atingido. Tente novamente em instantes.');
      }
      if (res.status === 401 || res.status === 403) {
        throw new AIProviderError('NO_KEY', 'Chave do Claude inválida ou sem permissão.');
      }
      if (res.status === 404) {
        throw new AIProviderError('NOT_FOUND', `Modelo "${this.model}" não encontrado para o provedor Claude.`);
      }
      if (res.status === 400 || res.status === 402) {
        throw new AIProviderError('UNKNOWN', `Claude rejeitou a requisição: ${msg}`);
      }
      if (res.status === 529) {
        throw new AIProviderError('RATE_LIMIT', `Claude indisponível no momento: ${msg}`);
      }
      throw new AIProviderError('UNKNOWN', `Erro na API do Claude: ${msg}`);
    }
    throw new AIProviderError('UNKNOWN', 'Falha na chamada ao provedor Claude.');
  }

  private toMessages(messages: AIMessage[]): any[] {
    const out: any[] = [];
    for (const m of messages) {
      if (m.role === 'assistant') {
        if (m.toolCalls && m.toolCalls.length > 0) {
          out.push({
            role: 'assistant',
            content: m.toolCalls.map(tc => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments
            }))
          });
        } else {
          out.push({ role: 'assistant', content: m.content ? [{ type: 'text', text: m.content }] : [] });
        }
      } else if (m.role === 'tool') {
        out.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: m.toolCallId || '',
            content: m.content
          }]
        });
      } else {
        out.push({ role: 'user', content: [{ type: 'text', text: m.content }] });
      }
    }
    return out;
  }

  async chat(req: AIChatRequest): Promise<AIResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      system: req.system,
      messages: this.toMessages(req.messages),
      max_tokens: req.maxOutputTokens ?? 2048,
      temperature: req.temperature ?? 0.2
    };

    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
      }));
    }

    const data = await this.request(body);
    const blocks: AnthropicContentBlock[] = data.content || [];

    const text = blocks.filter(b => b.type === 'text').map(b => b.text).filter(Boolean).join('\n') || null;
    const toolBlocks = blocks.filter(b => b.type === 'tool_use');
    const toolCalls: AIToolCall[] | null = toolBlocks.length > 0
      ? toolBlocks.map(b => ({
          id: b.id || `tu-${Math.random().toString(36).slice(2, 8)}`,
          name: b.name || '',
          arguments: b.input || {}
        }))
      : null;

    return { text, toolCalls };
  }

  async vision(req: { prompt: string; image: { mimeType: string; data: string } }): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: req.prompt },
          {
            type: 'image',
            source: { type: 'base64', media_type: req.image.mimeType, data: req.image.data }
          }
        ]
      }]
    };
    const data = await this.request(body);
    const blocks: AnthropicContentBlock[] = data.content || [];
    return blocks.filter(b => b.type === 'text').map(b => b.text).filter(Boolean).join('\n') || '';
  }
}
