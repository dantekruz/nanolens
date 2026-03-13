#!/bin/bash
# ============================================================
# run.sh  —  Start NanoLens (Backend + Frontend)
# Usage:  bash run.sh
# ============================================================

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   🔬 NanoLens — Startup Script           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Python backend ─────────────────────────────────────
echo "▶ Starting FastAPI backend on http://localhost:8000 ..."
cd "$ROOT"

# Check Python
if ! command -v python &>/dev/null; then
  echo "❌ Python not found. Please install Python 3.10+"
  exit 1
fi

# Install Python deps if needed
if ! python -c "import fastapi" 2>/dev/null; then
  echo "📦 Installing Python dependencies..."
  pip install -r requirements.txt --quiet
fi

# Start backend in background
python backend.py &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# ── 2. React frontend ─────────────────────────────────────
echo ""
echo "▶ Starting React frontend on http://localhost:3000 ..."
cd "$ROOT/nanolens"

# Check Node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org"
  kill $BACKEND_PID 2>/dev/null
  exit 1
fi

# Install npm packages if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing npm packages (first run only — takes ~1 min)..."
  npm install --silent
fi

# ── 3. Open browser after brief delay ─────────────────────
sleep 4 && (
  if command -v open &>/dev/null; then open http://localhost:3000   # macOS
  elif command -v xdg-open &>/dev/null; then xdg-open http://localhost:3000  # Linux
  fi
) &

npm start

# ── Cleanup on exit ───────────────────────────────────────
trap "echo ''; echo 'Shutting down...'; kill $BACKEND_PID 2>/dev/null" EXIT
