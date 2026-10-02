from contextlib import asynccontextmanager
from pathlib import Path
import shutil
import sqlite3
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .database import STORAGE_DIR, generate_selection_ticket_code, get_connection, initialize_database


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    content: str = ""


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    content: str | None = None


class DocumentSelectionCreate(BaseModel):
    start_offset: int = Field(ge=0)
    end_offset: int = Field(ge=0)
    selected_text: str = Field(min_length=1)
    instruction: str = Field(min_length=1, max_length=2000)


class DocumentSelectionUpdate(BaseModel):
    instruction: str = Field(min_length=1, max_length=2000)


class EditProposalCreate(BaseModel):
    proposed_text: str = Field(min_length=1)
    rationale: str = ""
    scope_type: str = Field(default="selection_only", pattern="^(selection_only|expanded)$")
    replacement_start_offset: int | None = Field(default=None, ge=0)
    replacement_end_offset: int | None = Field(default=None, ge=0)


class FolderCreate(BaseModel):
    section: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=120)
    parent_folder_id: int | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Personal AI Workspace API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def get_project_or_404(project_id: int) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, name, description, created_at, updated_at
            FROM projects
            WHERE id = ?
            """,
            (project_id,),
        ).fetchone()

    project = row_to_dict(row)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def get_document_or_404(document_id: int) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, project_id, title, content, created_at, updated_at
            FROM documents
            WHERE id = ?
            """,
            (document_id,),
        ).fetchone()

    document = row_to_dict(row)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


def get_material_or_404(material_id: int) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, project_id, original_filename, stored_path, content_type, size_bytes, uploaded_at
            FROM materials
            WHERE id = ?
            """,
            (material_id,),
        ).fetchone()

    material = row_to_dict(row)
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found")
    return material


def get_folder_or_404(folder_id: int) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, project_id, section, parent_folder_id, name, created_at
            FROM folders
            WHERE id = ?
            """,
            (folder_id,),
        ).fetchone()

    folder = row_to_dict(row)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


def get_selection_or_404(selection_id: int) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, ticket_code, document_id, start_offset, end_offset, selected_text,
                   before_context, after_context, document_updated_at, instruction, created_at, archived_at,
                   CASE
                       WHEN EXISTS (
                           SELECT 1 FROM edit_proposals
                           WHERE edit_proposals.selection_id = document_selections.id
                             AND edit_proposals.status = 'accepted'
                       ) THEN 'accepted'
                       WHEN EXISTS (
                           SELECT 1 FROM edit_proposals
                           WHERE edit_proposals.selection_id = document_selections.id
                             AND edit_proposals.status = 'pending'
                       ) THEN 'pending'
                       ELSE 'unprocessed'
                   END AS proposal_status
            FROM document_selections
            WHERE id = ?
            """,
            (selection_id,),
        ).fetchone()

    selection = row_to_dict(row)
    if selection is None:
        raise HTTPException(status_code=404, detail="Selection not found")
    return selection


def get_proposal_or_404(proposal_id: int) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, selection_id, document_id, replacement_start_offset, replacement_end_offset,
                   original_text, proposed_text, rationale, scope_type, status, created_at, decided_at
            FROM edit_proposals
            WHERE id = ?
            """,
            (proposal_id,),
        ).fetchone()

    proposal = row_to_dict(row)
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal


def safe_filename(filename: str) -> str:
    cleaned = Path(filename).name.strip().replace("\\", "_").replace("/", "_")
    return cleaned or "uploaded_file"


def project_materials_dir(project_id: int) -> Path:
    return STORAGE_DIR / "projects" / str(project_id) / "materials"


def delete_project_files(project_id: int) -> None:
    project_dir = STORAGE_DIR / "projects" / str(project_id)
    if project_dir.exists():
        shutil.rmtree(project_dir)


def available_project_name(connection: sqlite3.Connection, requested_name: str) -> str:
    base_name = requested_name.strip()
    if not base_name:
        raise HTTPException(status_code=422, detail="Project name is required")

    existing_rows = connection.execute(
        "SELECT name FROM projects WHERE name = ? OR name LIKE ?",
        (base_name, f"{base_name} (%)"),
    ).fetchall()
    existing_names = {row["name"] for row in existing_rows}

    if base_name not in existing_names:
        return base_name

    suffix = 2
    while f"{base_name} ({suffix})" in existing_names:
        suffix += 1

    return f"{base_name} ({suffix})"


def collect_folder_descendant_ids(connection: sqlite3.Connection, folder_id: int) -> list[int]:
    child_rows = connection.execute(
        "SELECT id FROM folders WHERE parent_folder_id = ?",
        (folder_id,),
    ).fetchall()
    descendant_ids: list[int] = []

    for row in child_rows:
        child_id = row["id"]
        descendant_ids.append(child_id)
        descendant_ids.extend(collect_folder_descendant_ids(connection, child_id))

    return descendant_ids


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/projects")
def list_projects() -> dict[str, list[dict[str, str | int]]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, description, created_at, updated_at
            FROM projects
            ORDER BY updated_at DESC, id DESC
            """
        ).fetchall()

    return {"projects": [dict(row) for row in rows]}


@app.post("/api/projects", status_code=201)
def create_project(payload: ProjectCreate) -> dict[str, Any]:
    with get_connection() as connection:
        name = available_project_name(connection, payload.name)
        cursor = connection.execute(
            """
            INSERT INTO projects (name, description)
            VALUES (?, ?)
            """,
            (name, payload.description.strip()),
        )
        connection.commit()
        project_id = cursor.lastrowid

    return {"project": get_project_or_404(project_id)}


@app.get("/api/projects/{project_id}")
def get_project(project_id: int) -> dict[str, Any]:
    return {"project": get_project_or_404(project_id)}


@app.patch("/api/projects/{project_id}")
def update_project(project_id: int, payload: ProjectUpdate) -> dict[str, Any]:
    get_project_or_404(project_id)

    current = get_project_or_404(project_id)
    name = payload.name.strip() if payload.name is not None else current["name"]
    description = payload.description.strip() if payload.description is not None else current["description"]

    try:
        with get_connection() as connection:
            connection.execute(
                """
                UPDATE projects
                SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (name, description, project_id),
            )
            connection.commit()
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="Project name already exists") from error

    return {"project": get_project_or_404(project_id)}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int) -> dict[str, str]:
    get_project_or_404(project_id)
    delete_project_files(project_id)

    with get_connection() as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        connection.commit()

    return {"status": "deleted"}


@app.get("/api/projects/{project_id}/documents")
def list_documents(project_id: int) -> dict[str, list[dict[str, Any]]]:
    get_project_or_404(project_id)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, project_id, title, content, created_at, updated_at
            FROM documents
            WHERE project_id = ?
            ORDER BY updated_at DESC, id DESC
            """,
            (project_id,),
        ).fetchall()

    return {"documents": [dict(row) for row in rows]}


@app.get("/api/projects/{project_id}/folders")
def list_folders(project_id: int) -> dict[str, list[dict[str, Any]]]:
    get_project_or_404(project_id)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, project_id, section, parent_folder_id, name, created_at
            FROM folders
            WHERE project_id = ?
            ORDER BY section ASC, parent_folder_id ASC, name ASC, id ASC
            """,
            (project_id,),
        ).fetchall()

    return {"folders": [dict(row) for row in rows]}


@app.post("/api/projects/{project_id}/folders", status_code=201)
def create_folder(project_id: int, payload: FolderCreate) -> dict[str, Any]:
    get_project_or_404(project_id)
    name = payload.name.strip()
    section = payload.section.strip()

    if not name:
        raise HTTPException(status_code=422, detail="Folder name is required")

    with get_connection() as connection:
        parent_folder_id = payload.parent_folder_id
        if parent_folder_id is not None:
            parent = connection.execute(
                """
                SELECT id, project_id, section
                FROM folders
                WHERE id = ?
                """,
                (parent_folder_id,),
            ).fetchone()
            if parent is None or parent["project_id"] != project_id or parent["section"] != section:
                raise HTTPException(status_code=400, detail="Parent folder does not belong to this section")

        cursor = connection.execute(
            """
            INSERT INTO folders (project_id, section, parent_folder_id, name)
            VALUES (?, ?, ?, ?)
            """,
            (project_id, section, parent_folder_id, name),
        )
        connection.execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (project_id,),
        )
        connection.commit()
        folder_id = cursor.lastrowid
        row = connection.execute(
            """
            SELECT id, project_id, section, parent_folder_id, name, created_at
            FROM folders
            WHERE id = ?
            """,
            (folder_id,),
        ).fetchone()

    return {"folder": dict(row)}


@app.delete("/api/folders/{folder_id}")
def delete_folder(folder_id: int) -> dict[str, str]:
    folder = get_folder_or_404(folder_id)

    with get_connection() as connection:
        folder_ids = [folder_id, *collect_folder_descendant_ids(connection, folder_id)]
        placeholders = ",".join("?" for _ in folder_ids)
        connection.execute(f"DELETE FROM folders WHERE id IN ({placeholders})", folder_ids)
        connection.execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (folder["project_id"],),
        )
        connection.commit()

    return {"status": "deleted"}


@app.post("/api/projects/{project_id}/documents", status_code=201)
def create_document(project_id: int, payload: DocumentCreate) -> dict[str, Any]:
    get_project_or_404(project_id)

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO documents (project_id, title, content)
            VALUES (?, ?, ?)
            """,
            (project_id, payload.title.strip(), payload.content),
        )
        connection.execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (project_id,),
        )
        connection.commit()
        document_id = cursor.lastrowid

    return {"document": get_document_or_404(document_id)}


@app.get("/api/documents/{document_id}")
def get_document(document_id: int) -> dict[str, Any]:
    return {"document": get_document_or_404(document_id)}


@app.patch("/api/documents/{document_id}")
def update_document(document_id: int, payload: DocumentUpdate) -> dict[str, Any]:
    document = get_document_or_404(document_id)
    title = payload.title.strip() if payload.title is not None else document["title"]
    content = payload.content if payload.content is not None else document["content"]

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE documents
            SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (title, content, document_id),
        )
        connection.execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (document["project_id"],),
        )
        connection.commit()

    return {"document": get_document_or_404(document_id)}


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: int) -> dict[str, str]:
    document = get_document_or_404(document_id)

    with get_connection() as connection:
        connection.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        connection.execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (document["project_id"],),
        )
        connection.commit()

    return {"status": "deleted"}


@app.get("/api/documents/{document_id}/selections")
def list_document_selections(document_id: int) -> dict[str, list[dict[str, Any]]]:
    get_document_or_404(document_id)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, ticket_code, document_id, start_offset, end_offset, selected_text,
                   before_context, after_context, document_updated_at, instruction, created_at, archived_at,
                   CASE
                       WHEN EXISTS (
                           SELECT 1 FROM edit_proposals
                           WHERE edit_proposals.selection_id = document_selections.id
                             AND edit_proposals.status = 'accepted'
                       ) THEN 'accepted'
                       WHEN EXISTS (
                           SELECT 1 FROM edit_proposals
                           WHERE edit_proposals.selection_id = document_selections.id
                             AND edit_proposals.status = 'pending'
                       ) THEN 'pending'
                       ELSE 'unprocessed'
                   END AS proposal_status
            FROM document_selections
            WHERE document_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (document_id,),
        ).fetchall()

    return {"selections": [dict(row) for row in rows]}


@app.post("/api/documents/{document_id}/selections", status_code=201)
def create_document_selection(document_id: int, payload: DocumentSelectionCreate) -> dict[str, Any]:
    document = get_document_or_404(document_id)
    content = document["content"]
    start_offset = payload.start_offset
    end_offset = payload.end_offset
    selected_text = payload.selected_text
    instruction = payload.instruction.strip()

    if not selected_text.strip():
        raise HTTPException(status_code=422, detail="Selected text is required")
    if not instruction:
        raise HTTPException(status_code=422, detail="Instruction is required")
    if end_offset <= start_offset:
        raise HTTPException(status_code=422, detail="Selection end must be after start")
    if end_offset > len(content):
        raise HTTPException(status_code=400, detail="Selection is outside document content")
    if content[start_offset:end_offset] != selected_text:
        raise HTTPException(status_code=409, detail="Selected text no longer matches document content")

    before_context = content[max(0, start_offset - 500) : start_offset]
    after_context = content[end_offset : min(len(content), end_offset + 500)]

    with get_connection() as connection:
        ticket_code = generate_selection_ticket_code(connection)
        cursor = connection.execute(
            """
            INSERT INTO document_selections (
                ticket_code, document_id, start_offset, end_offset, selected_text,
                before_context, after_context, document_updated_at, instruction
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ticket_code,
                document_id,
                start_offset,
                end_offset,
                selected_text,
                before_context,
                after_context,
                document["updated_at"],
                instruction,
            ),
        )
        connection.commit()
        selection_id = cursor.lastrowid

    return {"selection": get_selection_or_404(selection_id)}


@app.get("/api/selections/{selection_id}")
def get_selection(selection_id: int) -> dict[str, Any]:
    return {"selection": get_selection_or_404(selection_id)}


@app.patch("/api/selections/{selection_id}")
def update_selection(selection_id: int, payload: DocumentSelectionUpdate) -> dict[str, Any]:
    get_selection_or_404(selection_id)
    instruction = payload.instruction.strip()

    if not instruction:
        raise HTTPException(status_code=422, detail="Instruction is required")

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE document_selections
            SET instruction = ?
            WHERE id = ?
            """,
            (instruction, selection_id),
        )
        connection.commit()

    return {"selection": get_selection_or_404(selection_id)}


@app.post("/api/selections/{selection_id}/archive")
def archive_selection(selection_id: int) -> dict[str, Any]:
    get_selection_or_404(selection_id)

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE document_selections
            SET archived_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (selection_id,),
        )
        connection.commit()

    return {"selection": get_selection_or_404(selection_id)}


@app.post("/api/selections/{selection_id}/unarchive")
def unarchive_selection(selection_id: int) -> dict[str, Any]:
    get_selection_or_404(selection_id)

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE document_selections
            SET archived_at = NULL
            WHERE id = ?
            """,
            (selection_id,),
        )
        connection.commit()

    return {"selection": get_selection_or_404(selection_id)}


@app.delete("/api/selections/{selection_id}")
def delete_selection(selection_id: int) -> dict[str, str]:
    get_selection_or_404(selection_id)

    with get_connection() as connection:
        connection.execute("DELETE FROM document_selections WHERE id = ?", (selection_id,))
        connection.commit()

    return {"status": "deleted"}


@app.get("/api/selections/{selection_id}/proposals")
def list_selection_proposals(selection_id: int) -> dict[str, list[dict[str, Any]]]:
    get_selection_or_404(selection_id)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, selection_id, document_id, replacement_start_offset, replacement_end_offset,
                   original_text, proposed_text, rationale, scope_type, status, created_at, decided_at
            FROM edit_proposals
            WHERE selection_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (selection_id,),
        ).fetchall()

    return {"proposals": [dict(row) for row in rows]}


@app.post("/api/selections/{selection_id}/proposals", status_code=201)
def create_edit_proposal(selection_id: int, payload: EditProposalCreate) -> dict[str, Any]:
    selection = get_selection_or_404(selection_id)
    document = get_document_or_404(selection["document_id"])
    content = document["content"]

    replacement_start = (
        payload.replacement_start_offset
        if payload.replacement_start_offset is not None
        else selection["start_offset"]
    )
    replacement_end = (
        payload.replacement_end_offset
        if payload.replacement_end_offset is not None
        else selection["end_offset"]
    )
    proposed_text = payload.proposed_text
    rationale = payload.rationale.strip()

    if replacement_end <= replacement_start:
        raise HTTPException(status_code=422, detail="Replacement end must be after start")
    if replacement_end > len(content):
        raise HTTPException(status_code=400, detail="Replacement range is outside document content")
    if replacement_start > selection["start_offset"] or replacement_end < selection["end_offset"]:
        raise HTTPException(status_code=422, detail="Replacement range must include the selected text")

    original_text = content[replacement_start:replacement_end]
    if selection["selected_text"] not in original_text:
        raise HTTPException(status_code=409, detail="Selected text no longer appears in replacement range")

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO edit_proposals (
                selection_id, document_id, replacement_start_offset, replacement_end_offset,
                original_text, proposed_text, rationale, scope_type
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                selection_id,
                selection["document_id"],
                replacement_start,
                replacement_end,
                original_text,
                proposed_text,
                rationale,
                payload.scope_type,
            ),
        )
        connection.commit()
        proposal_id = cursor.lastrowid

    return {"proposal": get_proposal_or_404(proposal_id)}


@app.get("/api/proposals/{proposal_id}")
def get_proposal(proposal_id: int) -> dict[str, Any]:
    return {"proposal": get_proposal_or_404(proposal_id)}


@app.post("/api/proposals/{proposal_id}/accept")
def accept_proposal(proposal_id: int) -> dict[str, Any]:
    proposal = get_proposal_or_404(proposal_id)
    if proposal["status"] != "pending":
        raise HTTPException(status_code=409, detail="Proposal is not pending")

    document = get_document_or_404(proposal["document_id"])
    content = document["content"]
    start = proposal["replacement_start_offset"]
    end = proposal["replacement_end_offset"]

    if end > len(content) or content[start:end] != proposal["original_text"]:
        raise HTTPException(status_code=409, detail="Document changed since this proposal was created")

    updated_content = f"{content[:start]}{proposal['proposed_text']}{content[end:]}"

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE documents
            SET content = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (updated_content, proposal["document_id"]),
        )
        connection.execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (document["project_id"],),
        )
        connection.execute(
            """
            UPDATE edit_proposals
            SET status = 'accepted', decided_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (proposal_id,),
        )
        connection.commit()

    return {"proposal": get_proposal_or_404(proposal_id), "document": get_document_or_404(proposal["document_id"])}


@app.post("/api/proposals/{proposal_id}/reject")
def reject_proposal(proposal_id: int) -> dict[str, Any]:
    proposal = get_proposal_or_404(proposal_id)
    if proposal["status"] != "pending":
        raise HTTPException(status_code=409, detail="Proposal is not pending")

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE edit_proposals
            SET status = 'rejected', decided_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (proposal_id,),
        )
        connection.commit()

    return {"proposal": get_proposal_or_404(proposal_id)}


@app.get("/api/projects/{project_id}/materials")
def list_materials(project_id: int) -> dict[str, list[dict[str, Any]]]:
    get_project_or_404(project_id)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, project_id, original_filename, stored_path, content_type, size_bytes, uploaded_at
            FROM materials
            WHERE project_id = ?
            ORDER BY uploaded_at DESC, id DESC
            """,
            (project_id,),
        ).fetchall()

    return {"materials": [dict(row) for row in rows]}


@app.post("/api/projects/{project_id}/materials", status_code=201)
def upload_material(project_id: int, file: UploadFile = File(...)) -> dict[str, Any]:
    get_project_or_404(project_id)

    filename = safe_filename(file.filename or "uploaded_file")
    content = file.file.read()
    materials_dir = project_materials_dir(project_id)
    materials_dir.mkdir(parents=True, exist_ok=True)

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO materials (project_id, original_filename, stored_path, content_type, size_bytes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (project_id, filename, "", file.content_type or "", len(content)),
        )
        material_id = cursor.lastrowid
        stored_filename = f"{material_id}_{filename}"
        stored_path = materials_dir / stored_filename
        stored_path.write_bytes(content)
        connection.execute(
            "UPDATE materials SET stored_path = ? WHERE id = ?",
            (str(stored_path.relative_to(STORAGE_DIR)), material_id),
        )
        connection.execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (project_id,),
        )
        connection.commit()

    return {"material": get_material_or_404(material_id)}


@app.get("/api/materials/{material_id}/download")
def download_material(material_id: int) -> FileResponse:
    material = get_material_or_404(material_id)
    file_path = STORAGE_DIR / material["stored_path"]

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found")

    return FileResponse(
        file_path,
        media_type=material["content_type"] or "application/octet-stream",
        filename=material["original_filename"],
    )


@app.delete("/api/materials/{material_id}")
def delete_material(material_id: int) -> dict[str, str]:
    material = get_material_or_404(material_id)
    file_path = STORAGE_DIR / material["stored_path"]
    if file_path.exists():
        file_path.unlink()

    with get_connection() as connection:
        connection.execute("DELETE FROM materials WHERE id = ?", (material_id,))
        connection.execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (material["project_id"],),
        )
        connection.commit()

    return {"status": "deleted"}


@app.post("/api/cleanup-storage")
def cleanup_all_storage() -> dict[str, Any]:
    projects_dir = STORAGE_DIR / "projects"

    if not projects_dir.exists():
        return {"deleted_files": [], "deleted_count": 0, "deleted_bytes": 0}

    with get_connection() as connection:
        material_rows = connection.execute("SELECT stored_path FROM materials").fetchall()

    referenced_paths = {(STORAGE_DIR / row["stored_path"]).resolve() for row in material_rows}
    deleted_files: list[str] = []
    deleted_bytes = 0

    for materials_dir in projects_dir.glob("*/materials"):
        if not materials_dir.is_dir():
            continue

        for file_path in materials_dir.iterdir():
            if not file_path.is_file():
                continue

            resolved_path = file_path.resolve()
            if resolved_path in referenced_paths:
                continue

            file_size = file_path.stat().st_size
            file_path.unlink()
            deleted_files.append(str(file_path.relative_to(STORAGE_DIR)))
            deleted_bytes += file_size

    return {
        "deleted_files": deleted_files,
        "deleted_count": len(deleted_files),
        "deleted_bytes": deleted_bytes,
    }


@app.post("/api/projects/{project_id}/cleanup-storage")
def cleanup_project_storage(project_id: int) -> dict[str, Any]:
    get_project_or_404(project_id)
    materials_dir = project_materials_dir(project_id)

    if not materials_dir.exists():
        return {"deleted_files": [], "deleted_count": 0, "deleted_bytes": 0}

    with get_connection() as connection:
        material_rows = connection.execute(
            "SELECT stored_path FROM materials WHERE project_id = ?",
            (project_id,),
        ).fetchall()

    referenced_paths = {(STORAGE_DIR / row["stored_path"]).resolve() for row in material_rows}
    deleted_files: list[str] = []
    deleted_bytes = 0

    for file_path in materials_dir.iterdir():
        if not file_path.is_file():
            continue

        resolved_path = file_path.resolve()
        if resolved_path in referenced_paths:
            continue

        file_size = file_path.stat().st_size
        file_path.unlink()
        deleted_files.append(file_path.name)
        deleted_bytes += file_size

    return {
        "deleted_files": deleted_files,
        "deleted_count": len(deleted_files),
        "deleted_bytes": deleted_bytes,
    }


@app.get("/api/projects/{project_id}/search")
def search_project(project_id: int, q: str = "") -> dict[str, list[dict[str, Any]]]:
    get_project_or_404(project_id)
    query = q.strip()

    if not query:
        return {"documents": [], "materials": []}

    pattern = f"%{query}%"

    with get_connection() as connection:
        document_rows = connection.execute(
            """
            SELECT id, project_id, title, content, created_at, updated_at
            FROM documents
            WHERE project_id = ? AND (title LIKE ? OR content LIKE ?)
            ORDER BY updated_at DESC, id DESC
            """,
            (project_id, pattern, pattern),
        ).fetchall()
        material_rows = connection.execute(
            """
            SELECT id, project_id, original_filename, stored_path, content_type, size_bytes, uploaded_at
            FROM materials
            WHERE project_id = ? AND original_filename LIKE ?
            ORDER BY uploaded_at DESC, id DESC
            """,
            (project_id, pattern),
        ).fetchall()

    return {
        "documents": [dict(row) for row in document_rows],
        "materials": [dict(row) for row in material_rows],
    }
