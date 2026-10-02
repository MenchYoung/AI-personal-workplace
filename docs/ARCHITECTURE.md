# Architecture

## Phase 0 Shape

```text
Browser
  |
  | HTTP
  v
React Frontend
  |
  | REST API
  v
FastAPI Backend
  |
  | sqlite3
  v
storage/workspace.db
```

## Directories

- `frontend/`: browser UI.
- `backend/`: API service and SQLite initialization.
- `storage/`: local database and future uploaded files.
- `docs/`: product requirements, architecture, and development plan.

## Current API

- `GET /health`: confirms the backend is running.
- `GET /api/projects`: returns the current project list.
