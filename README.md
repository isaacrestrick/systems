# System Design Demo

FastAPI + Next.js monorepo for demonstrating system design concepts.

## Setup

### Backend
```bash
cd backend
uv sync
```

### Frontend
```bash
cd frontend
bun install
```

## Running

Start both servers in separate terminals:

**Backend** (port 8000):
```bash
cd backend && uv run uvicorn main:app --reload
```

**Frontend** (port 3000):
```bash
cd frontend && bun dev
```

Open http://localhost:3000

## Architecture

- Frontend requests to `/api/*` are proxied to the backend via Next.js rewrites
- Backend runs independently on port 8000