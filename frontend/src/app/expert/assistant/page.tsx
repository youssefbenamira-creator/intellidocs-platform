'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/apiClient';
import {
  Send,
  Bot,
  User,
  FileText,
  Globe,
  Loader2,
  Trash2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface Source {
  doc_id: number;
  type: 'uploaded' | 'scraped';
  title: string;
  filename: string;
  url: string;
  score: number;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  streaming?: boolean;
}

let msgId = 0;

function SourceChip({ src }: { src: Source }) {
  const href = src.type === 'uploaded'
    ? `/expert/library/${src.doc_id}`
    : `/expert/documents/${src.doc_id}`;
  const label = src.title || src.filename || src.url || 'Document';

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800 hover:bg-neutral-700 border border-white/10 text-xs text-neutral-300 hover:text-white transition-colors max-w-[220px]"
      title={label}
    >
      {src.type === 'uploaded'
        ? <FileText size={10} className="shrink-0" />
        : <Globe size={10} className="shrink-0" />}
      <span className="truncate">{label}</span>
      <ExternalLink size={9} className="shrink-0 text-neutral-500" />
    </Link>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${
        isUser ? 'bg-teal-500/20 text-teal-400' : 'bg-neutral-800 text-neutral-300'
      }`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-teal-500/15 text-white rounded-tr-sm border border-teal-500/20'
            : 'bg-neutral-800/80 text-neutral-200 rounded-tl-sm border border-white/5'
        }`}>
          {msg.content}
          {msg.streaming && (
            <span className="inline-block w-2 h-4 bg-teal-400 ml-0.5 animate-pulse rounded-sm align-middle" />
          )}
        </div>

        {/* Sources */}
        {msg.sources && msg.sources.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-neutral-500 px-1">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {msg.sources.slice(0, 5).map((src, i) => (
                <SourceChip key={i} src={src} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Check Ollama model status on mount
  useEffect(() => {
    fetchWithAuth('/assistant/status')
      .then(r => r.json())
      .then(d => setModelReady(d.ready === true))
      .catch(() => setModelReady(false));
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || busy) return;

    setInput('');
    setBusy(true);

    const userMsg: Message = { id: ++msgId, role: 'user', content: question };
    const asstMsg: Message = { id: ++msgId, role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, asstMsg]);

    // History to send: all previous turns (excluding the just-added pair)
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetchWithAuth('/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      });

      if (!res.body) throw new Error('No response body');

      const reader  = (res.body as any).getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                return [...prev.slice(0, -1), { ...last, content: last.content + data.token }];
              });
            }
            if (data.done) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                return [...prev.slice(0, -1), {
                  ...last,
                  sources: data.sources ?? [],
                  streaming: false,
                }];
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), {
          ...last,
          content: 'Connection error. Is the assistant service running?',
          streaming: false,
        }];
      });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [input, busy, messages]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot size={22} className="text-teal-400" />
            AI Assistant
          </h1>
          <p className="text-neutral-500 text-sm mt-0.5">
            Powered by Mistral 7B · Grounded on your documents
          </p>
        </div>
        <div className="flex items-center gap-3">
          {modelReady === false && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertCircle size={13} />
              Model loading…
            </span>
          )}
          {modelReady === true && (
            <span className="flex items-center gap-1.5 text-xs text-teal-400">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />
              Ready
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-neutral-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-neutral-800"
              title="Clear conversation"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50">
            <Bot size={40} className="text-neutral-600" />
            <p className="text-neutral-400 text-sm">
              Ask anything about your documents.
            </p>
            <p className="text-neutral-600 text-xs">
              Shift+Enter for newline · Enter to send
            </p>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 pt-4 border-t border-white/10">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder="Ask a question about your documents…"
            disabled={busy}
            className="flex-1 bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-500 text-sm resize-none focus:outline-none focus:border-teal-500/50 transition-colors disabled:opacity-50"
            style={{ maxHeight: '160px', overflowY: 'auto' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${el.scrollHeight}px`;
            }}
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-teal-500 hover:bg-teal-400 disabled:bg-neutral-700 disabled:text-neutral-500 text-white transition-colors"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[11px] text-neutral-600 mt-2 text-center">
          Answers are grounded on indexed documents — hallucination is minimised, not eliminated.
        </p>
      </div>
    </div>
  );
}
