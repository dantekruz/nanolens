# 🔬 NanoLens — Full Stack Setup Guide

## Project Structure

```
nanolens_full/
├── rag_engine.py       ← All RAG logic (extraction, embedding, chat)
├── backend.py          ← FastAPI server (REST API)
├── requirements.txt    ← Python dependencies
├── run.sh              ← One-command startup (Mac/Linux)
├── run.bat             ← One-command startup (Windows)
└── nanolens/           ← React frontend
    ├── src/
    │   ├── api.js      ← Calls FastAPI endpoints
    │   ├── App.jsx     ← Root component
    │   ├── index.css   ← All styles
    │   └── components/
    │       ├── Header.jsx
    │       ├── Sidebar.jsx
    │       ├── UploadView.jsx
    │       ├── ChatView.jsx
    │       ├── Message.jsx
    │       └── Toast.jsx
    └── package.json
```

---

## Step 1 — Fill in Your API Keys

Open `rag_engine.py` and set:

```python
GROQ_API_KEY     = "gsk_..."   # console.groq.com (free)
PINECONE_API_KEY = "pcsk_..."  # app.pinecone.io  (free)
INDEX_NAME       = "nanolens"  # your index name  (dim=384)
```

---

## Step 2 — Create Your Pinecone Index

In the Pinecone dashboard:
- **Dimension:** `384`
- **Metric:** `cosine`
- **Cloud:** AWS `us-east-1`
- **Name:** whatever you set as `INDEX_NAME`

---

## Step 3 — Run Everything

### Mac / Linux
```bash
bash run.sh
```

### Windows
Double-click `run.bat`

### Manual (run in two separate terminals)

**Terminal 1 — Backend:**
```bash
pip install -r requirements.txt
python backend.py
# → http://localhost:8000
```

**Terminal 2 — Frontend:**
```bash
cd nanolens
npm install     # first time only
npm start
# → http://localhost:3000
```

---

## Step 4 — Use the App

1. Open **http://localhost:3000**
2. Header shows 🟢 **Backend Online** when connected
3. Go to **Upload Paper** → drag in a PDF / CSV / DOCX → give it a name → click **Index Paper**
4. Go to **Research Chat** → select your paper → ask questions

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/api/namespaces` | List all indexed papers |
| POST | `/api/upload` | Upload + index a file |
| POST | `/api/chat` | Ask a question |

### Chat request body:
```json
{
  "question": "What was the PDI of the optimized formulation?",
  "namespace": "sharma_2023_curcumin",
  "history": [
    { "role": "user",      "content": "previous question" },
    { "role": "assistant", "content": "previous answer"   }
  ]
}
```

### Chat response:
```json
{
  "answer":  "The optimized formulation F9 showed a PDI of 0.18...",
  "mode":    "analytical",
  "reason":  "Question asks for a specific numeric value",
  "sources": [
    { "id": 1, "score": 0.94, "text": "[Section: Results | Page: 4] ..." }
  ]
}
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Header shows 🔴 Backend Offline | Start `python backend.py` first |
| `pip install` fails | Use `pip install -r requirements.txt --break-system-packages` |
| Pinecone dimension error | Create index with **dim=384** |
| CORS error in browser | Make sure backend is on port **8000** |
| `sentence_transformers` slow first load | Normal — model downloads once (~90MB) |
