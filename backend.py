import os
# ============================================================
# backend.py  —  FastAPI server
# Exposes the RAG engine as a REST API for the React frontend
#
# Local:  python backend.py
# Render: uvicorn backend:app --host 0.0.0.0 --port $PORT
# ============================================================

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import rag_engine

app = FastAPI(title="NanoLens API", version="1.0.0")

@app.on_event("startup")
async def startup_event():
    """Warm up fastembed model after port is bound (non-blocking)."""
    import threading
    def warm_up():
        print("🔥 Warming up fastembed model in background...")
        rag_engine.get_embedding_model()
        print("✅ Embedding model ready.")
    threading.Thread(target=warm_up, daemon=True).start()

# ── CORS ─────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    os.environ.get("FRONTEND_URL", ""),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ════════════════════════════════════════════════════════════
# MODELS
# ════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    question:  str
    namespace: str
    history:   list[dict] = []


# ════════════════════════════════════════════════════════════
# ROUTES
# ════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "NanoLens API running ✅"}


@app.get("/api/namespaces")
def get_namespaces():
    return {"namespaces": rag_engine.list_namespaces()}


@app.post("/api/upload")
async def upload_file(
    file:      UploadFile = File(...),
    namespace: str        = Form(...),
):
    if not namespace.strip():
        raise HTTPException(status_code=400, detail="Namespace must not be empty.")
    allowed = {"pdf", "csv", "docx"}
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not supported.")
    file_bytes = await file.read()
    try:
        return rag_engine.index_document(file_bytes, file.filename, namespace.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat")
def chat(body: ChatRequest):
    if not body.namespace.strip():
        raise HTTPException(status_code=400, detail="Namespace is required.")
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question is required.")
    try:
        return rag_engine.answer_question(
            question=body.question,
            namespace=body.namespace,
            history=body.history,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/delete-chat/{namespace}")
def delete_chat(namespace: str):
    try:
        return rag_engine.delete_chat_history(namespace)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════
# ENTRY POINT — only used for local dev (python backend.py)
# Render uses:  uvicorn backend:app --host 0.0.0.0 --port $PORT
# ════════════════════════════════════════════════════════════

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"🔬 NanoLens backend starting on http://localhost:{port}")
    uvicorn.run(
        "backend:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        reload_dirs=["./"],
        reload_excludes=["nanolens", "*.bat", "*.sh"],
    )
