// ═══════════════════════════════════════════════
// src/api.js  —  Backend communication service
// Calls FastAPI backend running at localhost:8000
// ═══════════════════════════════════════════════

// In production, set REACT_APP_BACKEND_URL in Vercel dashboard
// In local dev, it falls back to localhost:8000
const BASE_URL = "https://nanolens.onrender.com"

// ── Helper ────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const res  = await fetch(url, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `Request failed: ${res.status}`)
  }
  return res.json()
}

// ════════════════════════════════════════════════════════
// NAMESPACES  — fetch all indexed papers on startup
// ════════════════════════════════════════════════════════
export async function fetchNamespaces() {
  const data = await apiFetch("/api/namespaces")
  return data.namespaces   // string[]
}

// ════════════════════════════════════════════════════════
// UPLOAD  — index a research paper
// ════════════════════════════════════════════════════════
export async function uploadFile({ file, namespace, onProgress }) {
  // Show immediate progress feedback while the real upload runs
  onProgress(10, "Sending file to backend…")

  const formData = new FormData()
  formData.append("file",      file)
  formData.append("namespace", namespace)

  onProgress(25, "Extracting text and tables…")

  let result
  try {
    result = await apiFetch("/api/upload", {
      method: "POST",
      body:   formData,
      // Note: do NOT set Content-Type header — browser sets it with boundary for multipart
    })
  } catch (err) {
    onProgress(100, "❌ Upload failed: " + err.message)
    throw err
  }

  // Simulate staged progress after successful indexing
  onProgress(60, "Generating embeddings (MiniLM-L6-v2)…")
  await sleep(400)
  onProgress(80, "Upserting vectors to Pinecone…")
  await sleep(300)
  onProgress(95, "Storing metadata in SQLite…")
  await sleep(200)
  onProgress(100, `✅ Indexed ${result.chunks} chunks into "${result.namespace}"`)

  return result
  // Returns: { success, namespace, chunks, sections[] }
}

// ════════════════════════════════════════════════════════
// CHAT  — send a question, get an answer
// ════════════════════════════════════════════════════════
export async function sendChatMessage({ question, namespace, history }) {
  const data = await apiFetch("/api/chat", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ question, namespace, history }),
  })
  return data
  // Returns: { answer, mode, reason, sources: [{id, score, text}] }
}

// ════════════════════════════════════════════════════════
// UTILITY
// ════════════════════════════════════════════════════════
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ════════════════════════════════════════════════════════
// DELETE CHAT  — clears server-side chat history + memory
// ════════════════════════════════════════════════════════
export async function deleteChat(namespace) {
  const data = await apiFetch(`/api/delete-chat/${encodeURIComponent(namespace)}`, {
    method: 'DELETE',
  })
  return data
  // Returns: { success, namespace, message }
}
