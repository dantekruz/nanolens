// components/Header.jsx
import React from 'react'

const TABS = [
  { id: 'upload', label: 'Upload Paper' },
  { id: 'chat',   label: 'Research Chat' },
]

export default function Header({ activeTab, onTabChange, backendOk }) {
  const statusColor = backendOk === null ? '#f59e0b'   // checking → amber
                    : backendOk          ? '#10b981'   // ok → green
                    :                      '#f87171'   // fail → red

  const statusLabel = backendOk === null ? 'Connecting…'
                    : backendOk          ? 'Backend Online'
                    :                     'Backend Offline'

  return (
    <header className="header">
      <div className="header-logo">
        <div className="logo-mark">🔬</div>
        <div className="logo-wordmark">Nano<span>Lens</span></div>
      </div>

      <nav className="header-nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="header-status">
        <div className="status-dot" style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
        {statusLabel}
      </div>
    </header>
  )
}
