# ============================================================
# backend.py  —  FastAPI server for NanoLens
# ============================================================

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict
import uvicorn
import traceback
import re
import rag_engine


# ════════════════════════════════════════════════════════════
# APP INITIALIZATION
# ════════════════════════════════════════════════════════════

app = FastAPI(
    title="NanoLens API",
    version="1.1.0",
    description="Research-grade RAG backend for nanoemulsion papers",
)

# ── CORS (React dev server) ────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ════════════════════════════════════════════════════════════
# MODELS
# ════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    namespace: str = Field(..., min_length=1)
    history: List[Dict] = []


# ════════════════════════════════════════════════════════════
# UTILITIES
# ════════════════════════════════════════════════════════════

def sanitize_namespace(namespace: str) -> str:
    """
    Make namespace SQLite + Pinecone safe.
    Converts spaces and special characters to underscore.
    """
    namespace = namespace.strip()
    namespace = re.sub(r"\W+", "_", namespace)
    return namespace.lower()


# ════════════════════════════════════════════════════════════
# ROUTES
# ════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "NanoLens API running ✅"}


@app.get("/api/namespaces")
def get_namespaces():
    try:
        namespaces = rag_engine.list_namespaces()
        return {"namespaces": namespaces}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch namespaces.")


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    namespace: str = Form(...),
):
    """
    Upload and index a research paper (PDF / CSV / DOCX).
    """

    if not namespace.strip():
        raise HTTPException(status_code=400, detail="Namespace must not be empty.")

    namespace = sanitize_namespace(namespace)

    allowed_extensions = {"pdf", "csv", "docx"}
    if "." not in file.filename:
        raise HTTPException(status_code=400, detail="File must have an extension.")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Use PDF, CSV, or DOCX.",
        )

    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        print(f"\n📄 Uploading file: {file.filename}")
        print(f"📂 Namespace: {namespace}")
        print(f"📦 Size: {len(file_bytes)} bytes\n")

        result = rag_engine.index_document(
            file_bytes=file_bytes,
            filename=file.filename,
            namespace=namespace,
        )

        return {
            "status": "success",
            "message": "File indexed successfully.",
            "data": result,
        }

    except Exception as e:
        print("\n❌ Upload failed:")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Indexing failed: {str(e)}"
        )


@app.post("/api/chat")
def chat(body: ChatRequest):
    """
    Answer a question about an indexed paper namespace.
    """

    namespace = sanitize_namespace(body.namespace)

    try:
        result = rag_engine.answer_question(
            question=body.question.strip(),
            namespace=namespace,
            history=body.history,
        )
        return result

    except Exception as e:
        print("\n❌ Chat error:")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Chat processing failed: {str(e)}"
        )


# ════════════════════════════════════════════════════════════
# ENTRY POINT
# ════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("🔬 NanoLens backend starting on http://localhost:8000")

    # IMPORTANT:
    # Disable reload if using heavy ML libraries on Windows
    # (sentence-transformers, torch, MKL can crash on reload)

    uvicorn.run(
        "backend:app",
        host="0.0.0.0",
        port=8000,
        reload=False,   # <-- Stability improvement
    )