// components/Message.jsx
import React, { useState } from 'react'

// Minimal markdown renderer (bold, code, tables, line breaks)
function renderMarkdown(text) {
  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Table detection
    if (line.startsWith('|') && lines[i + 1]?.match(/^\|[-| ]+\|$/)) {
      const headers = line.split('|').filter(c => c.trim())
      i += 2 // skip separator
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').filter(c => c.trim()))
        i++
      }
      elements.push(
        <table key={i}>
          <thead>
            <tr>{headers.map((h, j) => <th key={j}>{inline(h.trim())}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{inline(cell.trim())}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )
      continue
    }

    // Normal line
    if (line.trim()) {
      elements.push(<p key={i}>{inline(line)}</p>)
    } else if (elements.length > 0) {
      // blank line → space
    }
    i++
  }

  return elements
}

function inline(text) {
  // Split on **bold**, `code`, *em*
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return <em key={i}>{part.slice(1, -1)}</em>
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

export function TypingBubble() {
  return (
    <div className="message-row bot">
      <div className="msg-avatar bot">🔬</div>
      <div className="bubble bot">
        <div className="typing-indicator">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    </div>
  )
}

export default function Message({ role, content, mode, sources }) {
  const [showSources, setShowSources] = useState(false)
  const isUser = role === 'user'

  return (
    <div className={`message-row ${isUser ? 'user' : 'bot'}`}>
      <div className={`msg-avatar ${isUser ? 'user' : 'bot'}`}>
        {isUser ? '👤' : '🔬'}
      </div>

      <div className="msg-body">
        <div className={`bubble ${isUser ? 'user' : 'bot'}`}>
          {isUser ? content : renderMarkdown(content)}
        </div>

        {!isUser && (
          <div className="msg-meta">
            {mode && (
              <span className={`mode-badge ${mode}`}>{mode}</span>
            )}

            {sources && sources.length > 0 && (
              <>
                <button
                  className="sources-btn"
                  onClick={() => setShowSources(s => !s)}
                >
                  {showSources ? '▾' : '▸'} {sources.length} source{sources.length > 1 ? 's' : ''}
                </button>

                {showSources && (
                  <div className="sources-panel" style={{ width: '100%' }}>
                    {sources.map((s, i) => (
                      <div className="source-item" key={i}>
                        <span className="source-score">Score: {s.score}</span>
                        {' '}· Chunk #{s.id}
                        <br />
                        <span style={{ color: 'var(--text2)' }}>
                          {s.text.length > 220 ? s.text.slice(0, 220) + '…' : s.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
