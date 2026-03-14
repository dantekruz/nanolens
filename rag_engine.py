# ============================================================
# rag_engine.py
# Pure RAG logic — no Streamlit. Called by backend.py (FastAPI)
# ============================================================

import io
import os
import re
import json
import sqlite3

import pandas as pd
import pdfplumber
from docx import Document
from groq import Groq
from pinecone import Pinecone

# ── Config — reads from env vars (set in Render dashboard)
#    or falls back to hardcoded values for local dev ──────────
GROQ_API_KEY     = os.environ.get("GROQ_API_KEY",     "")
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY", "")
INDEX_NAME       = os.environ.get("INDEX_NAME",       "quickstart")
DB_PATH          = "chat_data.db"

# ── Clients ──────────────────────────────────────────────────
groq_client    = Groq(api_key=GROQ_API_KEY)
pc             = Pinecone(api_key=PINECONE_API_KEY)
pinecone_index = pc.Index(INDEX_NAME)  # direct connection

# ── HuggingFace Inference API v2 for embeddings ──────────────
# Free, no local model, no RAM overhead
# Get your free token at huggingface.co → Settings → Access Tokens
# ── Pinecone Inference API for embeddings ─────────────────────
# Uses your existing Pinecone key — no new service needed
# ── Domain system prompt ─────────────────────────────────────
SYSTEM_PROMPT = """You are an expert research assistant specialising in
nanoemulsion science and pharmaceutical nanotechnology.

Key parameters to highlight: droplet size (nm), PDI, zeta potential (mV),
encapsulation efficiency (EE%), viscosity, emulsification method,
surfactant/co-surfactant (HLB, Smix), oil phase, stability studies,
in-vitro/in-vivo release, bioavailability, optimisation design
(Box-Behnken, CCD).

Rules:
1. Always extract and highlight numeric values.
2. Compare against benchmarks (PDI<0.3 = monodisperse; |zeta|>30 mV = stable; EE%>80%).
3. Use tables for multi-formulation comparisons.
4. End every answer with a "📌 Key Takeaway" section.
5. Never invent data not present in the provided context."""

SECTION_HEADERS = [
    "abstract","introduction","materials and methods","methodology",
    "results","discussion","conclusion","references","formulation",
    "characterization","preparation","optimization","in vitro",
    "in vivo","stability","acknowledgement",
]

# ════════════════════════════════════════════════════════════
# INIT HELPERS
# ════════════════════════════════════════════════════════════

def get_index():
    global pinecone_index
    if pinecone_index is not None:
        return pinecone_index
    existing = [idx["name"] for idx in pc.list_indexes()]
    if INDEX_NAME not in existing:
        pc.create_index(
            name=INDEX_NAME,
            dimension=384,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
    pinecone_index = pc.Index(INDEX_NAME)
    return pinecone_index


def get_embedding(text: str) -> list:
    """
    Uses Pinecone's Inference API to generate embeddings.
    Model: multilingual-e5-large → dim=1024
    No extra key needed — uses PINECONE_API_KEY.
    """
    from pinecone import Pinecone
    pc = Pinecone(api_key=PINECONE_API_KEY)
    result = pc.inference.embed(
        model="multilingual-e5-large",
        inputs=[str(text)],
        parameters={"input_type": "passage", "truncate": "END"}
    )
    return result[0].values
    """
    Calls HuggingFace Inference API v2 (router) for embeddings.
    Model: all-MiniLM-L6-v2 → dim=384.
    Requires HF_API_TOKEN — get free at huggingface.co/settings/tokens
    """
    import requests as req
    import numpy as np

    if not HF_API_TOKEN:
        raise ValueError("HF_API_TOKEN env var is not set. Get a free token at huggingface.co/settings/tokens")

    headers = {
        "Authorization": f"Bearer {HF_API_TOKEN}",
        "Content-Type": "application/json",
    }
    resp = req.post(
        HF_EMBED_URL,
        headers=headers,
        json={"inputs": str(text)},
        timeout=60,
    )
    resp.raise_for_status()
    result = resp.json()

    # Normalise whatever shape HF returns into a flat dim=384 vector
    if isinstance(result, list):
        # flat float vector [0.1, 0.2, ...]
        if isinstance(result[0], float):
            return result
        # [[0.1, 0.2, ...]] — one sentence
        if isinstance(result[0], list) and isinstance(result[0][0], float):
            return result[0]
        # [[[...]]] — token-level, mean pool
        if isinstance(result[0], list) and isinstance(result[0][0], list):
            arr = np.array(result[0])   # (tokens, dim)
            return arr.mean(axis=0).tolist()
    raise ValueError(f"Unexpected HF embedding response: {result}")


# ════════════════════════════════════════════════════════════
# TEXT UTILITIES
# ════════════════════════════════════════════════════════════

def chunk_text(text_input, max_words=400) -> list[str]:
    chunks = []
    items = text_input if isinstance(text_input, list) else [text_input]
    for text in items:
        words = str(text).split()
        for i in range(0, len(words), max_words):
            chunks.append(" ".join(words[i : i + max_words]))
    return [c for c in chunks if c.strip()]


def detect_section(line: str):
    stripped = line.strip().lower()
    for h in SECTION_HEADERS:
        if stripped.startswith(h) and len(stripped) < 80:
            return stripped.title()
    return None


def clean_columns(columns):
    seen, cleaned = {}, []
    for i, col in enumerate(columns):
        if not col or str(col).strip() == "":
            col = f"col_{i}"
        else:
            col = str(col).strip().replace("\n", "_").replace(" ", "_")
            col = "".join(c if c.isalnum() or c == "_" else "_" for c in col)
        if col in seen:
            seen[col] += 1
            col = f"{col}_{seen[col]}"
        else:
            seen[col] = 0
        cleaned.append(col)
    return cleaned


# ════════════════════════════════════════════════════════════
# EXTRACTION
# ════════════════════════════════════════════════════════════

def extract_pdf(file_bytes: bytes) -> list[str]:
    all_text, all_tables, combined_cols = [], [], []
    current_section = "General"

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages):
            page_text = page.extract_text() or ""
            if page_text.strip():
                lines, tagged = page_text.split("\n"), []
                for line in lines:
                    sec = detect_section(line)
                    if sec:
                        current_section = sec
                    tagged.append(line)
                tagged_text = f"[Section: {current_section} | Page: {page_num+1}]\n" + "\n".join(tagged)
                all_text.append(tagged_text.strip())

            for table in page.extract_tables():
                if len(table) > 1:
                    combined_cols.extend(table[0])
                    all_tables.extend(table[1:])

    safe_cols = clean_columns(list(dict.fromkeys(combined_cols)))
    table_rows = []
    for row in all_tables:
        if len(row) < len(safe_cols):
            row.extend([""] * (len(safe_cols) - len(row)))
        elif len(row) > len(safe_cols):
            row = row[: len(safe_cols)]
        table_rows.append(", ".join(str(r) for r in row))

    return table_rows + all_text


def extract_docx(file_bytes: bytes) -> list[str]:
    doc = Document(io.BytesIO(file_bytes))
    return [p.text.strip() for p in doc.paragraphs if p.text.strip()]


def extract_csv(file_bytes: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(file_bytes))
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
        elif pd.api.types.is_string_dtype(df[col]):
            df[col] = df[col].astype(str).str.strip()
            df[col].replace(["", "nan", "None", "NaN"], "0", inplace=True)
        else:
            df[col].fillna("0", inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


# ════════════════════════════════════════════════════════════
# INDEXING  (called by /api/upload)
# ════════════════════════════════════════════════════════════

def index_document(file_bytes: bytes, filename: str, namespace: str) -> dict:
    """
    Index a PDF, CSV, or DOCX into Pinecone + SQLite.
    Returns { success, namespace, chunks, sections }
    """
    idx   = get_index()
    ext   = filename.rsplit(".", 1)[-1].lower()
    conn  = sqlite3.connect(DB_PATH)

    if ext == "pdf":
        rows   = extract_pdf(file_bytes)
        df_out = pd.DataFrame({"text": rows})
        df_out.to_sql(namespace, conn, if_exists="replace", index=False)
        conn.close()

        chunks = chunk_text(rows)
        sections = set(
            re.search(r"\[Section: ([^\|]+)", t).group(1).strip()
            for t in rows if re.search(r"\[Section: ([^\|]+)", t)
        )

        for i, chunk in enumerate(chunks, 1):
            emb = get_embedding(chunk)
            idx.upsert(
                vectors=[{
                    "id": f"{namespace}-chunk-{i}",
                    "values": emb,
                    "metadata": {"text": chunk, "chunk_id": i, "total_chunks": len(chunks)},
                }],
                namespace=namespace,
            )

        return {"success": True, "namespace": namespace, "chunks": len(chunks),
                "sections": sorted(sections)}

    elif ext == "csv":
        df = extract_csv(file_bytes)
        df.to_sql(namespace, conn, if_exists="replace", index=False)
        conn.close()

        def row_to_sentence(row):
            return ". ".join(f"{c}: {v}" for c, v in row.items()
                             if pd.notna(v) and str(v).strip() not in ("", "0"))

        total, upserted = len(df), 0
        for i, row in df.iterrows():
            sentence = row_to_sentence(row)
            chunks   = chunk_text(sentence)
            for j, chunk in enumerate(chunks):
                emb = get_embedding(chunk)
                idx.upsert(
                    vectors=[{
                        "id": f"{namespace}-row-{i}-chunk-{j}",
                        "values": emb,
                        "metadata": {"text": chunk, "row_id": i, "chunk_id": j},
                    }],
                    namespace=namespace,
                )
                upserted += 1

        return {"success": True, "namespace": namespace, "chunks": upserted, "sections": []}

    elif ext == "docx":
        rows   = extract_docx(file_bytes)
        df_out = pd.DataFrame({"text": rows})
        df_out.to_sql(namespace, conn, if_exists="replace", index=False)
        conn.close()

        chunks = chunk_text(" ".join(rows))
        for i, chunk in enumerate(chunks, 1):
            emb = get_embedding(chunk)
            idx.upsert(
                vectors=[{
                    "id": f"{namespace}-chunk-{i}",
                    "values": emb,
                    "metadata": {"text": chunk, "chunk_id": i, "total_chunks": len(chunks)},
                }],
                namespace=namespace,
            )

        return {"success": True, "namespace": namespace, "chunks": len(chunks), "sections": []}

    else:
        raise ValueError(f"Unsupported file type: {ext}")


# ════════════════════════════════════════════════════════════
# CHAT  (called by /api/chat)
# ════════════════════════════════════════════════════════════

def _build_conversation_history(history: list[dict]) -> str:
    lines = []
    for msg in history[-5:]:
        role    = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            lines.append(f"User: {content}")
        else:
            lines.append(f"Assistant: {content}")
    return "\n".join(lines)


def _decide_mode(question: str, history_text: str) -> tuple[str, str]:
    prompt = f"""
Previous conversation:
{history_text}

Current question: "{question}"

You have two modes:
1. analytical → run pandas code on a DataFrame (numerical comparisons, stats)
2. semantic   → search paper text (qualitative, methods, explanations)

Reply ONLY with valid JSON, no other text:
{{"mode": "analytical" or "semantic", "reason": "one sentence"}}
"""
    resp = groq_client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )
    raw = resp.choices[0].message.content.strip()
    # strip markdown code fences if present
    raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("```").strip()
    try:
        d = json.loads(raw)
        return d.get("mode", "semantic"), d.get("reason", "")
    except Exception:
        return "semantic", "JSON parse fallback"


def _analytical_answer(question: str, namespace: str, history_text: str) -> str:
    conn = sqlite3.connect(DB_PATH)
    try:
        df = pd.read_sql(f"SELECT * FROM '{namespace}'", conn)
    except Exception as e:
        return f"⚠️ Could not load table '{namespace}': {e}"
    finally:
        conn.close()

    # coerce types
    for col in df.columns:
        df[col] = pd.to_numeric(df[col], errors="ignore")
        if df[col].dtype == "object":
            try:
                df[col] = pd.to_datetime(df[col], errors="raise")
            except Exception:
                pass

    code_prompt = f"""
Previous conversation:
{history_text}

Question: "{question}"

DataFrame df has columns: {list(df.columns)}.
Write ONE line of pandas code to answer the question.
Return ONLY the code inside ```python ... ```.
"""
    code_resp = groq_client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[{"role": "user", "content": code_prompt}],
        temperature=0,
    )
    raw_code = code_resp.choices[0].message.content.strip()
    match    = re.search(r"```python\n(.*?)```", raw_code, re.DOTALL)
    code     = match.group(1).strip() if match else raw_code.strip()

    try:
        result = eval(code, {"df": df, "pd": pd})  # noqa: S307
        if isinstance(result, pd.DataFrame):
            result_text = result.to_markdown()
        elif isinstance(result, pd.Series):
            result_text = result.to_string()
        else:
            result_text = str(result)
    except Exception as e:
        return f"⚠️ Pandas eval failed: {e}"

    summary_prompt = f"""
User asked: "{question}"
Pandas result:
{result_text}

Summarise clearly in English. Highlight any nanoemulsion parameter values.
"""
    summ = groq_client.chat.completions.create(
        model="llama3-70b-8192",
        messages=[{"role": "user", "content": summary_prompt}],
        temperature=0.2,
    )
    return summ.choices[0].message.content.strip()


def _semantic_answer(question: str, namespace: str, history_text: str) -> tuple[str, list]:
    idx       = get_index()
    query_emb = get_embedding(question)

    result  = idx.query(vector=query_emb, top_k=10, namespace=namespace, include_metadata=True)
    matches = result.get("matches", [])

    keywords  = [w.lower() for w in question.split()]
    re_ranked = []
    for match in matches:
        meta     = match.get("metadata", {})
        score    = match.get("score", 0)
        row_text = meta.get("text", "").strip()
        row_id   = meta.get("row_id", meta.get("chunk_id", "N/A"))
        kw_hits  = sum(1 for k in keywords if k in row_text.lower())
        re_ranked.append((score + 0.05 * kw_hits, row_id, row_text))

    re_ranked = sorted(re_ranked, key=lambda x: x[0], reverse=True)[:15]

    # batch summarise
    batch_size, summaries = 5, []
    for i in range(0, len(re_ranked), batch_size):
        batch   = re_ranked[i : i + batch_size]
        context = "\n".join(f"- {t[2]}" for t in batch)
        prompt  = f"""{SYSTEM_PROMPT}

Previous conversation:
{history_text}

Current question: "{question}"

Extracted data:
{context}

Instructions:
- Only use the given content — do NOT invent details.
- Highlight nanoemulsion parameter values.
- Interpret results against benchmarks where applicable.
"""
        resp = groq_client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        summaries.append(resp.choices[0].message.content.strip())

    final_prompt = f"""{SYSTEM_PROMPT}

Previous conversation:
{history_text}

Current question: {question}

Synthesised insights:
{chr(10).join(summaries)}

Instructions:
- Do NOT invent details.
- Use tables for multi-formulation comparisons.
- Use section headings (Formulation Composition, Characterization, Stability…).
- End with "📌 Key Takeaway".
"""
    final_resp = groq_client.chat.completions.create(
        model="llama3-70b-8192",
        messages=[{"role": "user", "content": final_prompt}],
        temperature=0.2,
    )
    answer  = final_resp.choices[0].message.content.strip()
    sources = [
        {"id": int(r[1]) if str(r[1]).isdigit() else i,
         "score": round(r[0], 3),
         "text": r[2]}
        for i, r in enumerate(re_ranked[:5])
    ]
    return answer, sources


def answer_question(question: str, namespace: str, history: list[dict]) -> dict:
    """
    Main entry point for /api/chat.
    Returns { answer, mode, reason, sources }
    """
    history_text        = _build_conversation_history(history)
    mode, reason        = _decide_mode(question, history_text)

    if mode == "analytical":
        answer  = _analytical_answer(question, namespace, history_text)
        sources = []
    else:
        answer, sources = _semantic_answer(question, namespace, history_text)

    return {"answer": answer, "mode": mode, "reason": reason, "sources": sources}


# ════════════════════════════════════════════════════════════
# UTILITY QUERIES
# ════════════════════════════════════════════════════════════

def list_namespaces() -> list[str]:
    """Return all indexed paper namespaces from SQLite."""
    try:
        conn   = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cursor.fetchall()]
        conn.close()
        return tables
    except Exception:
        return []


def delete_chat_history(namespace: str) -> dict:
    """
    Clears all chat data for a namespace from SQLite.
    Pinecone vectors are preserved — the paper stays searchable.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (namespace,))
    exists = cursor.fetchone()
    if not exists:
        conn.close()
        return {"success": True, "namespace": namespace, "message": "No table found — nothing to delete."}
    cursor.execute(f"DROP TABLE IF EXISTS '{namespace}'")
    conn.commit()
    conn.close()
    return {"success": True, "namespace": namespace, "message": f"Chat history for '{namespace}' deleted successfully."}
