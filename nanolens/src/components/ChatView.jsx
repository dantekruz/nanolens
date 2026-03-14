// components/ChatView.jsx
import React, { useState, useRef, useEffect } from 'react'
import Message, { TypingBubble } from './Message'
import { sendChatMessage, deleteChat } from '../api'

const SUGGESTIONS = [
  'Droplet size & PDI results?',
  'Zeta potential & stability findings?',
  'Optimized formulation composition?',
  'Encapsulation efficiency (EE%)?',
  'What preparation method was used?',
  'Describe the in-vitro release profile.',
]

function DeleteModal({ namespace, onConfirm, onCancel, deleting }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-icon">🗑️</div>
        <h2 className="modal-title">Delete Chat History</h2>
        <p className="modal-body">
          This will permanently delete all messages and free up memory
          for <strong>"{namespace}"</strong>.
          <br /><br />
          The indexed paper vectors in Pinecone will <em>not</em> be removed —
          you can still chat with this paper after clearing.
        </p>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button className="modal-btn-delete" onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChatView({ papers, activePaper, onSelectPaper, onToast }) {
  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [typing,    setTyping]    = useState(false)
  const [history,   setHistory]   = useState([])
  const [showModal, setShowModal] = useState(false)
  const [deleting,  setDeleting]  = useState(false)

  const messagesEnd = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  useEffect(() => {
    setMessages([])
    setHistory([])
  }, [activePaper])

  const autoResize = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  const useSuggestion = (text) => {
    setInput(text)
    textareaRef.current?.focus()
  }

  const handleDeleteConfirm = async () => {
    setDeleting(true)
    try {
      await deleteChat(activePaper)
      setMessages([])
      setHistory([])
      setShowModal(false)
      onToast('Chat history deleted and memory freed', 'success')
    } catch (err) {
      onToast('Delete failed: ' + err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || typing) return
    if (!activePaper) { onToast('Please select a paper first', 'error'); return }

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setTyping(true)

    const newHistory = [...history, { role: 'user', content: text }]

    try {
      const { answer, mode, sources } = await sendChatMessage({
        question: text, namespace: activePaper, history: newHistory,
      })
      setMessages(prev => [...prev, { role: 'bot', content: answer, mode, sources }])
      setHistory([...newHistory, { role: 'assistant', content: answer }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'bot', content: `⚠️ Could not reach backend.\n\nError: ${err.message}`,
        mode: 'error', sources: [],
      }])
      onToast('Backend connection failed', 'error')
    } finally {
      setTyping(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="chat-view">

      <div className="chat-topbar">
        <span className="chat-topbar-title">Research Chat</span>
        <div className={`active-badge ${activePaper ? 'set' : 'unset'}`}>
          {activePaper || 'No paper selected'}
        </div>
        <div className="spacer" />
        <select className="paper-select" value={activePaper} onChange={e => onSelectPaper(e.target.value)}>
          <option value="">— select paper —</option>
          {papers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {!isEmpty && (
          <button className="btn-delete-chat" onClick={() => setShowModal(true)} title="Delete chat to free memory">
            🗑 Delete
          </button>
        )}
      </div>

      <div className="messages-container">
        {isEmpty && !typing ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧪</div>
            <div className="empty-state-title">Ready to Analyse</div>
            <p className="empty-state-sub">
              Select a paper from the dropdown above, then ask anything about
              formulation parameters, stability data, characterization results, or methodology.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <Message key={i} role={msg.role} content={msg.content} mode={msg.mode} sources={msg.sources} />
            ))}
            {typing && <TypingBubble />}
          </>
        )}
        <div ref={messagesEnd} />
      </div>

      {isEmpty && !typing && (
        <div className="suggestions-bar">
          <div className="suggestions-label">Quick Questions</div>
          <div className="pills-row">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} className="pill-btn" onClick={() => useSuggestion(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-inputbar">
        <textarea
          ref={textareaRef} className="chat-textarea" rows={1} value={input}
          onChange={e => { setInput(e.target.value); autoResize() }}
          onKeyDown={handleKey}
          placeholder="Ask about formulations, characterization, stability, mechanisms…"
        />
        <button className="btn-send" disabled={!input.trim() || typing} onClick={send}>➤</button>
      </div>

      {showModal && (
        <DeleteModal
          namespace={activePaper}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowModal(false)}
          deleting={deleting}
        />
      )}

    </div>
  )
}
