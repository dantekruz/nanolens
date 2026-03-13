// App.jsx — NanoLens Root Component
import React, { useState, useCallback, useEffect } from 'react'
import './index.css'
import Header     from './components/Header'
import Sidebar    from './components/Sidebar'
import UploadView from './components/UploadView'
import ChatView   from './components/ChatView'
import Toast      from './components/Toast'
import { fetchNamespaces } from './api'

export default function App() {
  const [activeTab,   setActiveTab]   = useState('upload')
  const [papers,      setPapers]      = useState([])
  const [activePaper, setActivePaper] = useState('')
  const [toasts,      setToasts]      = useState([])
  const [backendOk,   setBackendOk]   = useState(null) // null=checking, true, false

  // ── Load namespaces from backend on mount ──────────────
  useEffect(() => {
    fetchNamespaces()
      .then(ns => {
        setPapers(ns)
        setBackendOk(true)
        // restore last active paper if still indexed
        const saved = localStorage.getItem('activePaper')
        if (saved && ns.includes(saved)) setActivePaper(saved)
      })
      .catch(() => {
        setBackendOk(false)
        showToast('⚠️ Cannot reach backend — is it running on port 8000?', 'error')
      })
  }, []) // eslint-disable-line

  // ── Toast system ───────────────────────────────────────
  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // ── Paper management ───────────────────────────────────
  const handlePaperIndexed = useCallback((ns) => {
    setPapers(prev => prev.includes(ns) ? prev : [...prev, ns])
  }, [])

  const handleSelectPaper = useCallback((ns) => {
    setActivePaper(ns)
    localStorage.setItem('activePaper', ns)
  }, [])

  return (
    <div className="app-shell">

      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        backendOk={backendOk}
      />

      <div className="app-body">
        <Sidebar
          papers={papers}
          activePaper={activePaper}
          onSelectPaper={p => { handleSelectPaper(p); setActiveTab('chat') }}
          onToast={showToast}
        />

        <main className="main-panel">
          {activeTab === 'upload' ? (
            <UploadView
              onPaperIndexed={handlePaperIndexed}
              onToast={showToast}
            />
          ) : (
            <ChatView
              papers={papers}
              activePaper={activePaper}
              onSelectPaper={handleSelectPaper}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
