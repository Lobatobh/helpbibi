'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, MessageCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ChatMessage } from '@/lib/rescue-types'

/**
 * Inline chat panel shown within the service tracker.
 * `myRole` determines message alignment (right = mine, left = other).
 */
export function ChatPanel({
  messages,
  myRole,
  onSend,
  counterpartName,
  compact = false,
}: {
  messages: ChatMessage[]
  myRole: 'client' | 'provider'
  onSend: (text: string) => void
  counterpartName: string
  compact?: boolean
}) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const handleSend = () => {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText('')
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <MessageCircle className="h-3.5 w-3.5 text-sky-400" />
        <span className="text-xs font-semibold text-white">Chat com {counterpartName}</span>
        <span className="ml-auto text-[10px] text-slate-500">{messages.length} msg(s)</span>
      </div>
      <div
        ref={scrollRef}
        className={`space-y-2 overflow-y-auto p-3 ${compact ? 'max-h-32' : 'max-h-48'}`}
      >
        {messages.length === 0 && (
          <p className="py-4 text-center text-[11px] text-slate-500">
            Nenhuma mensagem ainda. Envie a primeira!
          </p>
        )}
        {messages.map((m) => {
          const mine = m.from === myRole
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs ${
                  mine
                    ? 'rounded-br-sm bg-amber-500 text-slate-950'
                    : 'rounded-bl-sm bg-slate-800 text-slate-100'
                }`}
              >
                {!mine && (
                  <p className="mb-0.5 text-[10px] font-bold opacity-70">{m.fromName}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={`mt-0.5 text-right text-[9px] ${mine ? 'text-slate-700' : 'text-slate-400'}`}>
                  {new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 border-t border-slate-800 p-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Digite uma mensagem..."
          className="h-8 border-slate-700 bg-slate-950 text-xs text-white placeholder:text-slate-500"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!text.trim()}
          className="h-8 w-8 shrink-0 bg-amber-500 text-slate-950 hover:bg-amber-400"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Floating chat widget that toggles open/closed.
 * Used when we want chat available but not always visible.
 */
export function ChatWidget({
  messages,
  myRole,
  onSend,
  counterpartName,
  unreadCount,
}: {
  messages: ChatMessage[]
  myRole: 'client' | 'provider'
  onSend: (text: string) => void
  counterpartName: string
  unreadCount: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && (
        <div className="mb-2">
          <ChatPanel
            messages={messages}
            myRole={myRole}
            onSend={onSend}
            counterpartName={counterpartName}
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button
          onClick={() => setOpen((o) => !o)}
          variant="outline"
          className="flex-1 border-slate-700 bg-slate-800 text-sky-400 hover:bg-slate-700"
        >
          <MessageCircle className="mr-1.5 h-4 w-4" />
          {open ? 'Fechar chat' : 'Abrir chat'}
          {unreadCount > 0 && !open && (
            <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </Button>
      </div>
    </>
  )
}
