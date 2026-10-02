# Personal AI Workspace

A local-first personal research workspace for managing projects, materials, plans, documents, and controlled AI-assisted edits.

## Current Phase

This repository currently contains the Phase 1 project workspace MVP:

- `frontend/`: React + Vite web UI
- `backend/`: FastAPI API service with SQLite persistence
- `storage/`: local database and uploaded materials
- `docs/`: product and architecture notes

Supported Phase 1 workflows:

- Create, rename, and delete projects.
- Open a project workspace with Goals, Plans, Tasks, Knowledge, Documents, and Reviews sections.
- Create and edit Markdown documents.
- Upload, download, list, and delete local project materials.
- Search within a project by document title, Markdown content, and material filename.

## Run Locally

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open the frontend URL printed by Vite, usually `http://localhost:5173`.

## Local Data

- SQLite database: `storage/workspace.db`
- Uploaded project materials: `storage/projects/{project_id}/materials/`
