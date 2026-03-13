// components/ChatView.jsx
import React, { useState, useRef, useEffect } from 'react'
import Message, { TypingBubble } from './Message'
import { sendChatMessage } from '../api'

const SUGGESTIONS = [
  'Droplet size & PDI results?',
  'Zeta potential & stability findings?',
  'Optimized formulation composition?',
  'Encapsulation efficiency (EE%)?',
  'What preparation method was used?',
  'Describe the in-vitro release profile.',
]

export default function ChatView({ papers, activePaper, onSelectPaper, onToast }) {
  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [typing,    setTyping]    = useState(false)
  const [history,   setHistory]   = useState([])
  const messagesEnd = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const autoResize = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  const clearChat = () => {
    setMessages([])
    setHistory([])
  }

  const useSuggestion = (text) => {
    setInput(text)
    textareaRef.current?.focus()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || typing) return

    if (!activePaper) {
      onToast('Please select a paper first', 'error')
      return
    }

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setTyping(true)

    const newHistory = [...history, { role: 'user', content: text }]

    try {
      const { answer, mode, sources } = await sendChatMessage({
        question: text,
        namespace: activePaper,
        history: newHistory,
      })

      const botMsg = { role: 'bot', content: answer, mode, sources }
      setMessages(prev => [...prev, botMsg])
      setHistory([...newHistory, { role: 'assistant', content: answer }])

    } catch (err) {
      const errMsg = {
        role: 'bot',
        content: `⚠️ Could not reach backend. Is Streamlit running?\n\nError: ${err.message}`,
        mode: 'error',
        sources: [],
      }
      setMessages(prev => [...prev, errMsg])
      onToast('Backend connection failed', 'error')
    } finally {
      setTyping(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="chat-view">

      {/* Top bar */}
      <div className="chat-topbar">
        <span className="chat-topbar-title">Research Chat</span>

        <div className={`active-badge ${activePaper ? 'set' : 'unset'}`}>
          {activePaper || 'No paper selected'}
        </div>

        <div className="spacer" />

        <select
          className="paper-select"
          value={activePaper}
          onChange={e => onSelectPaper(e.target.value)}
        >
          <option value="">— select paper —</option>
          {papers.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <button className="btn-clear" onClick={clearChat}>Clear</button>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {isEmpty && !typing ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧪</div>
            <div className="empty-state-title">Ready to Analyse</div>
            <p className="empty-state-sub">
              Select a paper from the dropdown above, then ask anything about
              formulation parameters, stability data, characterization results,
              or methodology.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <Message
                key={i}
                role={msg.role}
                content={msg.content}
                mode={msg.mode}
                sources={msg.sources}
              />
            ))}
            {typing && <TypingBubble />}
          </>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* Suggestion pills — only show before first message */}
      {isEmpty && !typing && (
        <div className="suggestions-bar">
          <div className="suggestions-label">Quick Questions</div>
          <div className="pills-row">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                className="pill-btn"
                onClick={() => useSuggestion(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="chat-inputbar">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          rows={1}
          value={input}
          onChange={e => { setInput(e.target.value); autoResize() }}
          onKeyDown={handleKey}
          placeholder="Ask about formulations, characterization, stability, mechanisms…"
        />
        <button
          className="btn-send"
          disabled={!input.trim() || typing}
          onClick={send}
        >
          ➤
        </button>
      </div>

    </div>
  )
}
