import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Download, ChevronDown, Zap, Globe, Code, FileText, Terminal, Brain } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import clsx from 'clsx'

const MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', badge: 'Anthropic' },
  { id: 'openai/gpt-4o',               name: 'GPT-4o',            badge: 'OpenAI' },
  { id: 'google/gemini-1.5-pro',        name: 'Gemini 1.5 Pro',   badge: 'Google' },
  { id: 'x-ai/grok-2',                  name: 'Grok 2',           badge: 'xAI' },
  { id: 'moonshot/moonshot-v1-8k',       name: 'Kimi',             badge: 'Moonshot' },
]

const EVENT_ICONS = {
  thinking: <Brain className="w-4 h-4 text-yellow-400 animate-pulse" />,
  plan:     <FileText className="w-4 h-4 text-blue-400" />,
  action:   <Code className="w-4 h-4 text-purple-400" />,
  observation: <Terminal className="w-4 h-4 text-gray-400" />,
  final:    <Zap className="w-4 h-4 text-green-400" />,
  error:    <Square className="w-4 h-4 text-red-400" />,
  user:     <Globe className="w-4 h-4 text-ninja-400" />,
}

const EVENT_LABELS = {
  thinking:    'Pensando',
  plan:        'Plano de execução',
  action:      'Ação',
  observation: 'Resultado',
  final:       'Resposta final',
  error:       'Erro',
  user:        'Solicitação',
  session:     'Sessão iniciada',
}

export default function App() {
  const [input, setInput]         = useState('')
  const [model, setModel]         = useState(MODELS[0].id)
  const [events, setEvents]       = useState([])
  const [running, setRunning]     = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [files, setFiles]         = useState([])
  const [showModel, setShowModel] = useState(false)
  const [history, setHistory]     = useState([])

  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const eventsEndRef = useRef(null)

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const startTask = useCallback(async () => {
    if (!input.trim() || running) return

    const task = input.trim()
    setInput('')
    setEvents([])
    setFiles([])
    setSessionId(null)
    setRunning(true)

    setHistory(h => [{ task, ts: new Date().toLocaleTimeString() }, ...h.slice(0, 9)])

    try {
      const res = await fetch('/api/task/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, model }),
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.type === 'session') {
              setSessionId(ev.session_id)
            } else if (ev.type === 'done') {
              setRunning(false)
              // fetch files
              if (ev.session_id || sessionId) {
                fetchFiles(ev.session_id || sessionId)
              }
            } else {
              setEvents(prev => [...prev, ev])
            }
          } catch {}
        }
      }
    } catch (e) {
      setEvents(prev => [...prev, { type: 'error', content: `Erro de conexão: ${e.message}`, id: 'conn' }])
    } finally {
      setRunning(false)
    }
  }, [input, model, running, sessionId])

  const stopTask = async () => {
    if (!sessionId) return
    await fetch('/api/task/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    setRunning(false)
  }

  const fetchFiles = async (sid) => {
    try {
      const r = await fetch(`/api/session/${sid}/files`)
      const data = await r.json()
      setFiles(data.files || [])
    } catch {}
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      startTask()
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-gray-900 border-r border-gray-800 p-4 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center glow-green">
            <span className="text-white font-black text-sm">ON</span>
          </div>
          <span className="font-bold text-lg text-gradient">OmniNinja</span>
        </div>

        <div className="text-xs text-gray-500 uppercase tracking-wider px-2">Histórico</div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {history.length === 0 && (
            <p className="text-gray-600 text-xs px-2">Nenhuma tarefa ainda</p>
          )}
          {history.map((h, i) => (
            <div key={i} className="px-2 py-2 rounded-lg hover:bg-gray-800 cursor-pointer group">
              <p className="text-xs text-gray-300 truncate">{h.task}</p>
              <p className="text-xs text-gray-600">{h.ts}</p>
            </div>
          ))}
        </div>

        {/* Files produced */}
        {files.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-gray-500 uppercase tracking-wider px-2">Arquivos gerados</div>
            {files.map((f, i) => (
              <a
                key={i}
                href={f.download}
                download
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 text-xs text-gray-300"
              >
                <Download className="w-3 h-3 text-green-400 flex-shrink-0" />
                <span className="truncate">{f.name}</span>
              </a>
            ))}
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
              <span className="text-white font-black text-xs">ON</span>
            </div>
            <span className="font-bold text-gradient">OmniNinja</span>
          </div>

          {/* Model selector */}
          <div className="relative ml-auto">
            <button
              onClick={() => setShowModel(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 border border-gray-700 transition"
            >
              <Brain className="w-4 h-4 text-green-400" />
              <span>{MODELS.find(m => m.id === model)?.name}</span>
              <ChevronDown className={clsx("w-3 h-3 transition-transform", showModel && "rotate-180")} />
            </button>

            {showModel && (
              <div className="absolute right-0 top-10 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                {MODELS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setShowModel(false) }}
                    className={clsx(
                      "w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700 text-left transition",
                      model === m.id && "bg-green-900/30"
                    )}
                  >
                    <span className="text-sm text-gray-200">{m.name}</span>
                    <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">{m.badge}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Events stream */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {events.length === 0 && !running && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center glow-green">
                <span className="text-white font-black text-3xl">ON</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gradient mb-2">OmniNinja</h1>
                <p className="text-gray-400 text-lg">Agente autônomo de IA. O que deseja realizar?</p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
                {[
                  '📊 Faça uma análise de mercado sobre IA em 2025',
                  '🌐 Crie um site HTML/CSS responsivo com tema dark',
                  '🐍 Escreva um script Python para processar CSV',
                  '🔍 Pesquise e compare os melhores frameworks JS',
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s.slice(2))}
                    className="text-left p-3 rounded-xl glass hover:bg-gray-800 text-sm text-gray-300 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {events.map((ev, i) => (
            <EventCard key={ev.id || i} event={ev} />
          ))}

          {running && (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
              </div>
              <span className="text-sm text-gray-400">OmniNinja trabalhando...</span>
            </div>
          )}

          <div ref={eventsEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-800 bg-gray-900/30">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-3 glass rounded-2xl p-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Digite uma tarefa para o OmniNinja executar..."
                disabled={running}
                rows={1}
                className="flex-1 bg-transparent resize-none outline-none text-gray-100 placeholder-gray-500 text-sm py-1 max-h-40"
                style={{ height: 'auto' }}
                onInput={e => {
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
              />
              {running ? (
                <button
                  onClick={stopTask}
                  className="flex-shrink-0 p-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white transition"
                  title="Parar"
                >
                  <Square className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={startTask}
                  disabled={!input.trim()}
                  className={clsx(
                    "flex-shrink-0 p-2.5 rounded-xl text-white transition",
                    input.trim()
                      ? "bg-green-600 hover:bg-green-500 glow-green"
                      : "bg-gray-700 cursor-not-allowed opacity-50"
                  )}
                  title="Enviar"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
            </div>
            <p className="text-center text-xs text-gray-600 mt-2">
              OmniNinja pode cometer erros. Verifique informações importantes.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function EventCard({ event }) {
  const [open, setOpen] = useState(event.type !== 'action')

  const colors = {
    thinking:    'border-yellow-500/20 bg-yellow-500/5',
    plan:        'border-blue-500/20 bg-blue-500/5',
    action:      'border-purple-500/20 bg-purple-500/5',
    observation: 'border-gray-500/20 bg-gray-500/5',
    final:       'border-green-500/30 bg-green-500/8',
    error:       'border-red-500/20 bg-red-500/5',
    user:        'border-ninja-500/20 bg-ninja-500/5',
  }

  return (
    <div className={clsx("rounded-xl border p-4 max-w-4xl mx-auto w-full transition-all", colors[event.type] || 'border-gray-700 bg-gray-800/30')}>
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setOpen(v => !v)}
      >
        <span>{EVENT_ICONS[event.type]}</span>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {EVENT_LABELS[event.type] || event.type}
        </span>
        <ChevronDown className={clsx("w-3 h-3 text-gray-500 ml-auto transition-transform", open && "rotate-180")} />
      </div>

      {open && (
        <div className="mt-3 text-sm text-gray-200 overflow-hidden">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '')
                return !inline && match ? (
                  <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" {...props}>
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-green-300 text-xs" {...props}>
                    {children}
                  </code>
                )
              },
              p: ({children}) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
              ul: ({children}) => <ul className="list-disc list-inside space-y-1 mb-2">{children}</ul>,
              ol: ({children}) => <ol className="list-decimal list-inside space-y-1 mb-2">{children}</ol>,
              h1: ({children}) => <h1 className="text-xl font-bold text-white mb-3">{children}</h1>,
              h2: ({children}) => <h2 className="text-lg font-bold text-white mb-2">{children}</h2>,
              h3: ({children}) => <h3 className="font-bold text-white mb-1">{children}</h3>,
              a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-400 underline hover:text-green-300">{children}</a>,
              blockquote: ({children}) => <blockquote className="border-l-2 border-gray-600 pl-3 text-gray-400 my-2">{children}</blockquote>,
            }}
          >
            {event.content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}
