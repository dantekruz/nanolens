// components/Sidebar.jsx
import React, { useState } from 'react'

const BENCHMARKS = [
  { param: 'Droplet Size', val: '20–200 nm' },
  { param: 'PDI',          val: '< 0.3' },
  { param: 'Zeta Potential', val: '± 30 mV' },
  { param: 'EE%',          val: '> 80%' },
  { param: 'pH (oral)',    val: '4.5–7.4' },
]

const NE_TYPES = [
  { abbr: 'O/W',         desc: 'Oil-in-Water — hydrophobic drugs' },
  { abbr: 'W/O',         desc: 'Water-in-Oil — anhydrous skin' },
  { abbr: 'SNEDDS',      desc: 'Self-Nano-Emulsifying DDS' },
  { abbr: 'Nanoemulgel', desc: 'Nanoemulsion in gel base' },
]

export default function Sidebar({ papers, activePaper, onSelectPaper, onToast }) {
  const [backendUrl, setBackendUrl] = useState(
    localStorage.getItem('backendUrl') || 'http://localhost:8501'
  )

  const saveConfig = () => {
    localStorage.setItem('backendUrl', backendUrl.replace(/\/$/, ''))
    onToast('Config saved', 'success')
  }

  return (
    <aside className="sidebar">

      {/* ── Config ── */}
      <div className="sidebar-section">
        <div className="sidebar-label">⚙ Backend Config</div>

        <div className="config-field">
          <label>Streamlit URL</label>
          <input
            className="config-input"
            value={backendUrl}
            onChange={e => setBackendUrl(e.target.value)}
            placeholder="http://localhost:8501"
          />
        </div>

        <div className="config-field">
          <label>Embedding Model</label>
          <input
            className="config-input"
            value="MiniLM-L6-v2 (local)"
            readOnly
          />
        </div>

        <div className="config-field">
          <label>LLM</label>
          <input
            className="config-input"
            value="llama-3.1-8b-instant"
            readOnly
          />
        </div>

        <button className="btn-save" onClick={saveConfig}>
          Save Config
        </button>
      </div>

      {/* ── Indexed Papers ── */}
      <div className="sidebar-section" style={{ flex: 1 }}>
        <div className="sidebar-label">📄 Indexed Papers</div>
        <div className="paper-list">
          {papers.length === 0 ? (
            <div className="empty-papers">No papers indexed yet</div>
          ) : (
            papers.map(p => (
              <div
                key={p}
                className={`paper-item ${p === activePaper ? 'active' : ''}`}
                onClick={() => onSelectPaper(p)}
              >
                <div className="paper-dot" />
                {p}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Benchmarks ── */}
      <div className="sidebar-section">
        <div className="sidebar-label">📋 NE Benchmarks</div>
        <div className="bench-table">
          {BENCHMARKS.map(b => (
            <div className="bench-row" key={b.param}>
              <span className="bench-param">{b.param}</span>
              <span className="bench-val">{b.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── NE Types ── */}
      <div className="sidebar-section">
        <div className="sidebar-label">🔬 NE Types</div>
        <div className="ne-type-list">
          {NE_TYPES.map(t => (
            <div className="ne-type-item" key={t.abbr}>
              <strong>{t.abbr}</strong>
              <span>{t.desc}</span>
            </div>
          ))}
        </div>
      </div>

    </aside>
  )
}
