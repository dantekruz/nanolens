// components/UploadView.jsx
import React, { useState, useCallback } from 'react'
import { uploadFile } from '../api'

const FILE_ICONS = { pdf: '📕', csv: '📊', docx: '📝' }

function formatBytes(b) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(2) + ' MB'
}

function slugify(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
}

export default function UploadView({ onPaperIndexed, onToast }) {
  const [file,      setFile]      = useState(null)
  const [namespace, setNamespace] = useState('')
  const [dragging,  setDragging]  = useState(false)
  const [progress,  setProgress]  = useState(null) // { pct, label, logs }
  const [uploading, setUploading] = useState(false)
  const [done,      setDone]      = useState(false)

  const handleFile = useCallback((f) => {
    if (!f) return
    setFile(f)
    setDone(false)
    if (!namespace) setNamespace(slugify(f.name))
  }, [namespace])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const onInputChange = (e) => handleFile(e.target.files[0])

  const removeFile = () => {
    setFile(null)
    setNamespace('')
    setProgress(null)
    setDone(false)
  }

  const startUpload = async () => {
    if (!file || !namespace.trim()) return
    setUploading(true)
    setDone(false)
    setProgress({ pct: 0, label: 'Starting…', logs: ['📄 File: ' + file.name, '🏷 Namespace: ' + namespace] })

    try {
      await uploadFile({
        file,
        namespace: namespace.trim(),
        onProgress: (pct, msg) => {
          setProgress(prev => ({
            pct,
            label: msg,
            logs: [...(prev?.logs || []), msg],
          }))
        },
      })

      onPaperIndexed(namespace.trim())
      onToast(`"${namespace}" indexed successfully`, 'success')
      setDone(true)

      setTimeout(() => {
        setFile(null)
        setNamespace('')
        setProgress(null)
        setDone(false)
      }, 3000)

    } catch (err) {
      onToast('Upload failed: ' + err.message, 'error')
      setProgress(prev => ({
        ...prev,
        logs: [...(prev?.logs || []), '❌ Error: ' + err.message],
      }))
    } finally {
      setUploading(false)
    }
  }

  const ext = file?.name.split('.').pop().toLowerCase()
  const canUpload = file && namespace.trim() && !uploading

  return (
    <div className="upload-view">

      {/* Hero */}
      <div className="page-hero">
        <h1 className="page-title">Upload a <em>Research Paper</em></h1>
        <p className="page-sub">
          Index your nanoemulsion research. Supports PDF (research papers),
          CSV (formulation data), and DOCX. Content is embedded and stored
          in Pinecone for intelligent retrieval.
        </p>
      </div>

      {/* Drop Zone or File Preview */}
      {!file ? (
        <div
          className={`dropzone-wrapper ${dragging ? 'active-drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById('file-input').click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf,.csv,.docx"
            style={{ display: 'none' }}
            onChange={onInputChange}
          />
          <span className="drop-icon-emoji">📄</span>
          <div className="drop-title">Drop your paper here</div>
          <div className="drop-sub">or click to browse</div>
          <div className="drop-chips">
            <span className="chip">PDF</span>
            <span className="chip">CSV</span>
            <span className="chip">DOCX</span>
          </div>
        </div>
      ) : (
        <div className="file-card">
          <div className="file-card-icon">{FILE_ICONS[ext] || '📄'}</div>
          <div className="file-card-meta">
            <div className="file-card-name">{file.name}</div>
            <div className="file-card-size">{formatBytes(file.size)}</div>
          </div>
          <button className="btn-remove" onClick={removeFile}>✕</button>
        </div>
      )}

      {/* Namespace + Button */}
      <div className="field-row">
        <div className="field-group">
          <label>Paper Namespace / ID</label>
          <input
            className="field-input"
            value={namespace}
            onChange={e => setNamespace(e.target.value)}
            placeholder="e.g. sharma_2023_curcumin_nanoemulsion"
          />
        </div>
        <button
          className="btn-primary"
          disabled={!canUpload}
          onClick={startUpload}
        >
          {uploading ? 'Indexing…' : done ? '✅ Done!' : 'Index Paper →'}
        </button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="progress-block">
          <div className="progress-header">
            <span style={{ color: 'var(--text2)', fontSize: '0.75rem' }}>
              {progress.label}
            </span>
            <span className="progress-pct">{progress.pct}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: progress.pct + '%' }} />
          </div>
          <div className="progress-log">
            {progress.logs.map((l, i) => (
              <div
                key={i}
                className={l.startsWith('✅') ? 'log-ok' : l.startsWith('❌') ? 'log-err' : ''}
              >
                › {l}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
