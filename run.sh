#!/usr/bin/env bash
# One command to run the whole demo: builds the frontend, installs the backend, starts the app.
#   ./run.sh                      SQLite, offline demo assistant (no API key needed)
#   REDLINE_DATABASE_URL=postgresql://user:pass@host/db ./run.sh      PostgreSQL
#   ANTHROPIC_API_KEY=... ./run.sh                                     real Claude
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8000}"
if [ ! -f frontend/dist/index.html ]; then
  (cd frontend && npm ci --no-audit --no-fund && npm run build)
fi
pip install -q -r backend/requirements.txt
echo
echo "Redline: http://localhost:${PORT}   sign in with admin@redline.dev / demo1234"
cd backend && exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
