'use client'

import { useState, useRef, useEffect } from 'react';
import {
  Send, LoaderCircle, Sparkles, ShieldCheck, Database, CalendarDays,
  Bot, AlertTriangle, CircleOff
} from 'lucide-react';
import { sendCopilotQuestion } from '../../actions/copilot';
import type { CopilotHistoryMsg } from '../../actions/copilot';

export interface CopilotAccess {
  enabled: boolean;
  hasAI: boolean;
  canUse: boolean;
}

interface ToolMetaView {
  name: string;
  periodo?: string;
  origem?: string[];
  nota?: string;
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools?: ToolMetaView[];
  error?: boolean;
}

const SUGESTOES = [
  'Qual foi o faturamento de vendas nos últimos 30 dias?',
  'Como está o resultado (lucro ou prejuízo) neste mês?',
  'Quais campos têm maior rentabilidade e por quê?',
  'Quais produtos têm maior margem bruta?',
  'Quais clientes estão inativos há mais tempo?',
  'Quais horários têm menor ocupação nas quadras?',
  'Quais contas a pagar estão pendentes?',
  'Qual a projeção de fechamento do mês?',
];

let uid = 0;
const nextId = () => `m${Date.now()}_${uid++}`;

export default function CopilotClient({ access }: { access: CopilotAccess }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const unavailable = !access.canUse || !access.enabled || !access.hasAI;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput('');
    setApiError(null);

    const history: CopilotHistoryMsg[] = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { id: nextId(), role: 'user', content: q }]);
    setLoading(true);

    const res = await sendCopilotQuestion(q, history);
    setLoading(false);

    if (res.success) {
      setMessages(prev => [...prev, { id: nextId(), role: 'assistant', content: res.resposta || '', tools: res.ferramentas }]);
    } else {
      setApiError(res.error || 'Erro ao processar a pergunta.');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      {/* Cabeçalho do chat */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-mrts-blue to-indigo-500 text-white flex items-center justify-center shadow">
            <Bot size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              Copiloto de Gestão <Sparkles size={16} className="text-amber-500" />
            </h2>
            <p className="text-xs text-gray-500">
              Pergunte sobre faturamento, DRE, rentabilidade, clientes, estoque e contas.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700">
            <ShieldCheck size={13} /> Somente dados reais
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">
            <Database size={13} /> Ferramentas seguras
          </span>
        </div>
      </div>

      {/* Estado indisponível */}
      {unavailable && (
        <div className="p-8 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
            <CircleOff size={26} />
          </div>
          <h3 className="font-bold text-gray-700 text-lg">Copiloto indisponível</h3>
          <p className="text-sm text-gray-500 max-w-md">
            {!access.canUse
              ? 'Seu perfil ainda não tem permissão para usar o Copiloto de Gestão. Fale com um administrador para liberar.'
              : !access.enabled
                ? 'O Copiloto está desligado neste ambiente (flag COPILOT_ENABLED inativa). Ele será ativado apenas em ambientes de teste aprovados.'
                : 'A chave de API de IA não está configurada neste ambiente.'}
          </p>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <AlertTriangle size={12} /> Nenhuma pergunta será enviada para modelos de IA enquanto estiver desativado.
          </p>
        </div>
      )}

      {!unavailable && (
        <>
          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-[280px] max-h-[480px]">
            {messages.length === 0 && (
              <div className="py-2">
                <p className="text-sm text-gray-500 mb-3 font-bold text-gray-600">O que você quer saber sobre o negócio?</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {SUGESTOES.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      disabled={loading}
                      className="text-left text-sm bg-gray-50 hover:bg-mrts-blue/5 border border-gray-100 hover:border-mrts-blue/30 rounded-xl px-4 py-2.5 text-gray-600 font-medium transition disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] md:max-w-[75%] ${m.role === 'user' ? 'bg-mrts-blue text-white rounded-2xl rounded-br-md px-4 py-3' : 'bg-slate-50 border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3'}`}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed font-medium">
                    {m.content}
                  </p>
                  {m.role === 'assistant' && m.tools && m.tools.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200/70 space-y-1.5">
                      {m.tools.map((t, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-gray-500">
                          <Database size={12} className="mt-0.5 shrink-0 text-mrts-blue" />
                          <div>
                            <span className="font-bold text-gray-600">{t.name}</span>
                            {t.periodo && (
                              <span className="inline-flex items-center gap-1 ml-2"><CalendarDays size={11} /> {t.periodo}</span>
                            )}
                            {t.origem && t.origem.length > 0 && (
                              <span className="ml-1 text-gray-400">· {t.origem.join(', ')}</span>
                            )}
                            {t.nota && <span className="block text-gray-400 italic">{t.nota}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-50 border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-sm text-gray-500 font-bold">
                  <LoaderCircle className="animate-spin" size={16} /> Consultando dados e gerando resposta...
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {apiError && (
            <div className="mx-6 mb-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
              {apiError}
            </div>
          )}

          {/* Rodapé */}
          <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Ex.: Como está o resultado deste mês?"
                rows={1}
                className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-mrts-blue/30 focus:border-mrts-blue bg-gray-50"
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="bg-mrts-blue text-white font-bold px-5 py-3 rounded-xl hover:bg-blue-800 transition disabled:opacity-40 flex items-center gap-2 h-[46px]"
              >
                {loading ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              As respostas são geradas por IA com base exclusivamente nos dados das ferramentas de consulta. Período e origem dos dados aparecem junto a cada resposta.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
