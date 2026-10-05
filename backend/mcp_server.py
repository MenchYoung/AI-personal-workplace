import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile
from typing import Any
import xml.etree.ElementTree as ET

from app.database import STORAGE_DIR, get_connection, initialize_database


SERVER_INFO = {"name": "personal-ai-workspace", "version": "0.1.0"}
PROTOCOL_VERSION = "2024-11-05"
MAX_MATERIAL_TEXT_CHARS = 12000
DEFAULT_MEMORY_MAX_CHARS = 12000
DEFAULT_PDF_RENDER_DPI = 150
MAX_RENDERED_PAGES = 40
SELECTION_WORKFLOW = [
    "Understand the selected text together with before_context and after_context before writing.",
    "If the selection or instruction depends on project facts, Knowledge, materials, slides, files, or database context, inspect the relevant project documents/materials before proposing text.",
    "By default, only replace the selected text. Keep replacement_start_offset and replacement_end_offset equal to the saved selection offsets unless the user explicitly asks for a wider edit.",
    "Check whether the proposed selected-text replacement reads naturally in the surrounding context.",
    "If nearby sentences would also need changes for best fluency but the user did not explicitly allow a wider edit, keep the proposal scoped to the selected text and explain the wider recommendation in rationale.",
]


def row_to_dict(row: Any) -> dict[str, Any] | None:
    return dict(row) if row else None


def error(message: str) -> dict[str, Any]:
    return {"error": message}


def material_path(stored_path: str) -> Path:
    path = (STORAGE_DIR / stored_path).resolve()
    storage_root = STORAGE_DIR.resolve()
    if not path.is_relative_to(storage_root):
        raise ValueError("Material path is outside storage")
    return path


def xml_text_from_zip(path: Path, prefixes: tuple[str, ...]) -> str:
    parts: list[str] = []
    with zipfile.ZipFile(path) as archive:
        names = sorted(name for name in archive.namelist() if name.endswith(".xml") and name.startswith(prefixes))
        for name in names:
            root = ET.fromstring(archive.read(name))
            text_nodes = [node.text for node in root.iter() if node.tag.endswith("}t") and node.text]
            if text_nodes:
                parts.append("\n".join(text_nodes))
    return "\n\n".join(parts)


def text_from_pdf(path: Path) -> tuple[str, str | None]:
    try:
        from pypdf import PdfReader
    except ImportError:
        return "", "PDF text extraction requires the pypdf package in the backend environment."

    reader = PdfReader(str(path))
    pages: list[str] = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(f"[Page {index}]\n{text.strip()}")

    if not pages:
        return "", "No extractable PDF text was found. This may be a scanned PDF or image-only slide deck."
    return "\n\n".join(pages), None


def read_material_text(path: Path) -> tuple[str, str | None]:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".yaml", ".yml", ".html"}:
        for encoding in ("utf-8", "utf-8-sig", "gbk"):
            try:
                return path.read_text(encoding=encoding), None
            except UnicodeDecodeError:
                continue
        return path.read_text(encoding="utf-8", errors="replace"), None
    if suffix == ".docx":
        return xml_text_from_zip(path, ("word/",)), None
    if suffix == ".pptx":
        return xml_text_from_zip(path, ("ppt/slides/",)), None
    if suffix == ".pdf":
        return text_from_pdf(path)
    return "", f"Text extraction is not supported for {suffix or 'this file type'} yet."


def pdf_page_count(path: Path) -> int:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF rendering requires the pypdf package in the backend environment.") from exc

    return len(PdfReader(str(path)).pages)


def pdftoppm_path() -> str | None:
    discovered = shutil.which("pdftoppm")
    if discovered:
        return discovered

    bundled = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "native" / "poppler" / "Library" / "bin" / "pdftoppm.exe"
    if bundled.exists():
        return str(bundled)
    return None


def list_projects(_: dict[str, Any]) -> dict[str, Any]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, description, created_at, updated_at
            FROM projects
            ORDER BY updated_at DESC, id DESC
            """
        ).fetchall()
    return {"projects": [dict(row) for row in rows]}


def list_documents(arguments: dict[str, Any]) -> dict[str, Any]:
    project_id = arguments.get("project_id")
    if project_id is None:
        return error("project_id is required")

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, project_id, title, created_at, updated_at
            FROM documents
            WHERE project_id = ?
            ORDER BY updated_at DESC, id DESC
            """,
            (project_id,),
        ).fetchall()
    return {"documents": [dict(row) for row in rows]}


def list_materials(arguments: dict[str, Any]) -> dict[str, Any]:
    project_id = arguments.get("project_id")
    if project_id is None:
        return error("project_id is required")

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, project_id, original_filename, content_type, size_bytes, uploaded_at
            FROM materials
            WHERE project_id = ?
            ORDER BY uploaded_at DESC, id DESC
            """,
            (project_id,),
        ).fetchall()
    return {"materials": [dict(row) for row in rows]}


def review_row(connection: Any, project_id: int) -> dict[str, Any] | None:
    return row_to_dict(
        connection.execute(
            """
            SELECT id, project_id, title, content, created_by, created_at, updated_at
            FROM project_reviews
            WHERE project_id = ?
            """,
            (project_id,),
        ).fetchone()
    )


def memory_row(connection: Any, project_id: int) -> dict[str, Any] | None:
    return row_to_dict(
        connection.execute(
            """
            SELECT id, project_id, content, max_chars, source_summary, updated_at
            FROM project_memory
            WHERE project_id = ?
            """,
            (project_id,),
        ).fetchone()
    )


def get_project_review(arguments: dict[str, Any]) -> dict[str, Any]:
    project_id = arguments.get("project_id")
    if project_id is None:
        return error("project_id is required")

    with get_connection() as connection:
        project = row_to_dict(
            connection.execute(
                """
                SELECT id, name, description, created_at, updated_at
                FROM projects
                WHERE id = ?
                """,
                (project_id,),
            ).fetchone()
        )
        if project is None:
            return error("Project not found")
        return {
            "project": project,
            "review": review_row(connection, project_id),
            "memory": memory_row(connection, project_id),
        }


def get_project_context(arguments: dict[str, Any]) -> dict[str, Any]:
    project_id = arguments.get("project_id")
    if project_id is None:
        return error("project_id is required")

    with get_connection() as connection:
        project = row_to_dict(
            connection.execute(
                """
                SELECT id, name, description, created_at, updated_at
                FROM projects
                WHERE id = ?
                """,
                (project_id,),
            ).fetchone()
        )
        if project is None:
            return error("Project not found")

        documents = [
            dict(row)
            for row in connection.execute(
                """
                SELECT id, project_id, title, created_at, updated_at
                FROM documents
                WHERE project_id = ?
                ORDER BY updated_at DESC, id DESC
                """,
                (project_id,),
            ).fetchall()
        ]
        materials = [
            dict(row)
            for row in connection.execute(
                """
                SELECT id, project_id, original_filename, content_type, size_bytes, uploaded_at
                FROM materials
                WHERE project_id = ?
                ORDER BY uploaded_at DESC, id DESC
                """,
                (project_id,),
            ).fetchall()
        ]
        folders = [
            dict(row)
            for row in connection.execute(
                """
                SELECT id, project_id, section, parent_folder_id, name, created_at
                FROM folders
                WHERE project_id = ?
                ORDER BY section ASC, parent_folder_id ASC, name ASC, id ASC
                """,
                (project_id,),
            ).fetchall()
        ]
        selections = [
            dict(row)
            for row in connection.execute(
                """
                SELECT document_selections.id, document_selections.ticket_code,
                       document_selections.document_id, documents.title AS document_title,
                       document_selections.selected_text, document_selections.instruction,
                       document_selections.created_at, document_selections.archived_at
                FROM document_selections
                JOIN documents ON documents.id = document_selections.document_id
                WHERE documents.project_id = ?
                ORDER BY document_selections.created_at DESC, document_selections.id DESC
                LIMIT 20
                """,
                (project_id,),
            ).fetchall()
        ]
        proposals = [
            dict(row)
            for row in connection.execute(
                """
                SELECT edit_proposals.id, edit_proposals.selection_id,
                       document_selections.ticket_code,
                       edit_proposals.document_id, documents.title AS document_title,
                       edit_proposals.scope_type, edit_proposals.status,
                       edit_proposals.rationale, edit_proposals.created_at, edit_proposals.decided_at
                FROM edit_proposals
                JOIN documents ON documents.id = edit_proposals.document_id
                JOIN document_selections ON document_selections.id = edit_proposals.selection_id
                WHERE documents.project_id = ?
                ORDER BY edit_proposals.created_at DESC, edit_proposals.id DESC
                LIMIT 20
                """,
                (project_id,),
            ).fetchall()
        ]

        return {
            "project": project,
            "documents": documents,
            "materials": materials,
            "folders": folders,
            "recent_selections": selections,
            "recent_proposals": proposals,
            "review": review_row(connection, project_id),
            "memory": memory_row(connection, project_id),
            "review_workflow": [
                "Read project context, current review, and current memory before writing.",
                "Inspect relevant documents, Knowledge materials, and folders. Use material names, folder hierarchy, years, versions, and document purpose to reconcile facts across sources.",
                "Use read_material for text and render_material_pages for visually important PDF pages.",
                "Build an integrated current-state understanding instead of writing isolated material summaries.",
                "When newer or more authoritative material updates an older status, keep the latest resolved fact as the current fact. For example, if an older material says MICCAI is under review and a newer material says MICCAI is accepted, the review and memory should treat MICCAI as accepted.",
                "Write a project-level review covering Knowledge contents, confirmed current facts, outdated facts replaced by newer materials when relevant, current progress, recent additions, completed work, missing work, and next steps.",
                f"Rewrite memory as a compressed summary within {DEFAULT_MEMORY_MAX_CHARS} characters; do not simply append.",
                "Save review with save_project_review and memory with save_project_memory.",
            ],
        }


def save_project_review(arguments: dict[str, Any]) -> dict[str, Any]:
    project_id = arguments.get("project_id")
    title = str(arguments.get("title", "Project Review")).strip()
    content = str(arguments.get("content", ""))
    created_by = str(arguments.get("created_by", "codex")).strip()
    if project_id is None:
        return error("project_id is required")
    if not title:
        return error("title is required")
    if not created_by:
        return error("created_by is required")

    with get_connection() as connection:
        project = row_to_dict(connection.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone())
        if project is None:
            return error("Project not found")
        connection.execute(
            """
            INSERT INTO project_reviews (project_id, title, content, created_by)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
                title = excluded.title,
                content = excluded.content,
                created_by = excluded.created_by,
                updated_at = CURRENT_TIMESTAMP
            """,
            (project_id, title, content, created_by),
        )
        connection.execute("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (project_id,))
        connection.commit()
        return {"review": review_row(connection, project_id)}


def save_project_memory(arguments: dict[str, Any]) -> dict[str, Any]:
    project_id = arguments.get("project_id")
    content = str(arguments.get("content", ""))
    source_summary = str(arguments.get("source_summary", ""))
    max_chars = arguments.get("max_chars", DEFAULT_MEMORY_MAX_CHARS)
    if project_id is None:
        return error("project_id is required")
    if not isinstance(max_chars, int):
        return error("max_chars must be an integer")
    if max_chars > DEFAULT_MEMORY_MAX_CHARS:
        return error(f"max_chars cannot exceed {DEFAULT_MEMORY_MAX_CHARS}")
    if len(content) > max_chars:
        return error("Memory content exceeds max_chars. Compress it further before saving.")

    with get_connection() as connection:
        project = row_to_dict(connection.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone())
        if project is None:
            return error("Project not found")
        connection.execute(
            """
            INSERT INTO project_memory (project_id, content, max_chars, source_summary)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
                content = excluded.content,
                max_chars = excluded.max_chars,
                source_summary = excluded.source_summary,
                updated_at = CURRENT_TIMESTAMP
            """,
            (project_id, content, max_chars, source_summary),
        )
        connection.execute("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (project_id,))
        connection.commit()
        return {"memory": memory_row(connection, project_id)}


def read_material(arguments: dict[str, Any]) -> dict[str, Any]:
    material_id = arguments.get("material_id")
    if material_id is None:
        return error("material_id is required")

    with get_connection() as connection:
        material = row_to_dict(
            connection.execute(
                """
                SELECT id, project_id, original_filename, stored_path, content_type, size_bytes, uploaded_at
                FROM materials
                WHERE id = ?
                """,
                (material_id,),
            ).fetchone()
        )
    if material is None:
        return error("Material not found")

    try:
        path = material_path(material["stored_path"])
        if not path.exists():
            return error("Material file is missing from storage")
        text, warning = read_material_text(path)
    except Exception as exc:
        return error(f"Unable to read material: {exc}")

    truncated = len(text) > MAX_MATERIAL_TEXT_CHARS
    return {
        "material": {
            "id": material["id"],
            "project_id": material["project_id"],
            "original_filename": material["original_filename"],
            "content_type": material["content_type"],
            "size_bytes": material["size_bytes"],
            "uploaded_at": material["uploaded_at"],
        },
        "text": text[:MAX_MATERIAL_TEXT_CHARS],
        "text_char_count": len(text),
        "truncated": truncated,
        "warning": warning,
    }


def render_material_pages(arguments: dict[str, Any]) -> dict[str, Any]:
    material_id = arguments.get("material_id")
    requested_pages = arguments.get("pages")
    dpi = arguments.get("dpi", DEFAULT_PDF_RENDER_DPI)
    max_pages = arguments.get("max_pages", MAX_RENDERED_PAGES)

    if material_id is None:
        return error("material_id is required")
    if not isinstance(dpi, int) or dpi < 72 or dpi > 220:
        return error("dpi must be an integer between 72 and 220")
    if not isinstance(max_pages, int) or max_pages < 1 or max_pages > MAX_RENDERED_PAGES:
        return error(f"max_pages must be an integer between 1 and {MAX_RENDERED_PAGES}")

    with get_connection() as connection:
        material = row_to_dict(
            connection.execute(
                """
                SELECT id, project_id, original_filename, stored_path, content_type, size_bytes, uploaded_at
                FROM materials
                WHERE id = ?
                """,
                (material_id,),
            ).fetchone()
        )
    if material is None:
        return error("Material not found")

    try:
        path = material_path(material["stored_path"])
        if not path.exists():
            return error("Material file is missing from storage")
        if path.suffix.lower() != ".pdf":
            return error("render_material_pages currently supports PDF materials only")

        page_count = pdf_page_count(path)
        if requested_pages is None:
            pages = list(range(1, min(page_count, max_pages) + 1))
        else:
            if not isinstance(requested_pages, list) or not all(isinstance(page, int) for page in requested_pages):
                return error("pages must be a list of one-based page numbers")
            pages = [page for page in requested_pages if 1 <= page <= page_count]
            if not pages:
                return error("No requested pages are inside the PDF page range")
            pages = pages[:max_pages]

        renderer = pdftoppm_path()
        if renderer is None:
            return error("PDF page rendering requires pdftoppm, but it was not found")

        output_dir = STORAGE_DIR / "material_pages" / str(material_id)
        output_dir.mkdir(parents=True, exist_ok=True)

        rendered_pages: list[dict[str, Any]] = []
        for page in pages:
            output_prefix = output_dir / f"page_{page:03d}_r{dpi}"
            output_path = output_prefix.with_suffix(".png")
            if not output_path.exists():
                subprocess.run(
                    [
                        renderer,
                        "-png",
                        "-singlefile",
                        "-r",
                        str(dpi),
                        "-f",
                        str(page),
                        "-l",
                        str(page),
                        str(path),
                        str(output_prefix),
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            rendered_pages.append(
                {
                    "page_number": page,
                    "path": str(output_path),
                    "relative_path": str(output_path.relative_to(STORAGE_DIR)),
                }
            )
    except subprocess.CalledProcessError as exc:
        return error(f"PDF rendering failed: {exc.stderr or exc.stdout or exc}")
    except Exception as exc:
        return error(f"Unable to render material pages: {exc}")

    return {
        "material": {
            "id": material["id"],
            "project_id": material["project_id"],
            "original_filename": material["original_filename"],
            "content_type": material["content_type"],
            "size_bytes": material["size_bytes"],
            "uploaded_at": material["uploaded_at"],
        },
        "page_count": page_count,
        "rendered_pages": rendered_pages,
        "rendered_page_count": len(rendered_pages),
        "dpi": dpi,
        "max_pages": max_pages,
        "note": "Use these PNG paths for visual inspection when PDF layout, images, charts, or screenshots matter.",
    }


def get_selection(arguments: dict[str, Any]) -> dict[str, Any]:
    selection_id = arguments.get("selection_id")
    ticket_code = str(arguments.get("ticket_code", "")).strip().lstrip("#")
    if selection_id is None and not ticket_code:
        return error("selection_id or ticket_code is required")

    with get_connection() as connection:
        where_clause = "id = ?"
        where_value = selection_id
        if selection_id is None:
            where_clause = "ticket_code = ?"
            where_value = ticket_code
        row = connection.execute(
            f"""
            SELECT id, ticket_code, document_id, start_offset, end_offset, selected_text,
                   before_context, after_context, document_updated_at, instruction, created_at, archived_at
            FROM document_selections
            WHERE {where_clause}
            """,
            (where_value,),
        ).fetchone()
        selection = row_to_dict(row)
        if selection is None:
            return error("Selection not found")

        document = row_to_dict(
            connection.execute(
                """
                SELECT id, project_id, title, content, created_at, updated_at
                FROM documents
                WHERE id = ?
                """,
                (selection["document_id"],),
            ).fetchone()
        )
        if document is None:
            return error("Document not found")

        project = row_to_dict(
            connection.execute(
                """
                SELECT id, name, description, created_at, updated_at
                FROM projects
                WHERE id = ?
                """,
                (document["project_id"],),
            ).fetchone()
        )

    return {
        "selection": selection,
        "document": {
            "id": document["id"],
            "project_id": document["project_id"],
            "title": document["title"],
            "created_at": document["created_at"],
            "updated_at": document["updated_at"],
        },
        "project": project,
        "guidance": (
            "Follow the fixed selection workflow. Understand context first. If project facts or Knowledge are involved, "
            "inspect relevant documents/materials before proposing. By default, only replace the selected text and check "
            "that the replacement reads naturally in context."
        ),
        "workflow": SELECTION_WORKFLOW,
    }


def search_project(arguments: dict[str, Any]) -> dict[str, Any]:
    project_id = arguments.get("project_id")
    query = str(arguments.get("query", "")).strip()
    if project_id is None:
        return error("project_id is required")
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
            SELECT id, project_id, original_filename, content_type, size_bytes, uploaded_at
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


def create_edit_proposal(arguments: dict[str, Any]) -> dict[str, Any]:
    selection_id = arguments.get("selection_id")
    ticket_code = str(arguments.get("ticket_code", "")).strip().lstrip("#")
    proposed_text = str(arguments.get("proposed_text", "")).strip()
    rationale = str(arguments.get("rationale", "")).strip()
    scope_type = arguments.get("scope_type", "selection_only")
    replacement_start = arguments.get("replacement_start_offset")
    replacement_end = arguments.get("replacement_end_offset")

    if selection_id is None and not ticket_code:
        return error("selection_id or ticket_code is required")
    if not proposed_text:
        return error("proposed_text is required")
    if scope_type not in {"selection_only", "expanded"}:
        return error("scope_type must be selection_only or expanded")

    with get_connection() as connection:
        where_clause = "id = ?"
        where_value = selection_id
        if selection_id is None:
            where_clause = "ticket_code = ?"
            where_value = ticket_code
        selection = row_to_dict(
            connection.execute(
                f"""
                SELECT id, ticket_code, document_id, start_offset, end_offset, selected_text
                FROM document_selections
                WHERE {where_clause}
                """,
                (where_value,),
            ).fetchone()
        )
        if selection is None:
            return error("Selection not found")

        document = row_to_dict(
            connection.execute(
                """
                SELECT id, content
                FROM documents
                WHERE id = ?
                """,
                (selection["document_id"],),
            ).fetchone()
        )
        if document is None:
            return error("Document not found")

        content = document["content"]
        start = replacement_start if replacement_start is not None else selection["start_offset"]
        end = replacement_end if replacement_end is not None else selection["end_offset"]

        if not isinstance(start, int) or not isinstance(end, int):
            return error("replacement offsets must be integers")
        if end <= start:
            return error("replacement_end_offset must be after replacement_start_offset")
        if start > selection["start_offset"] or end < selection["end_offset"]:
            return error("replacement range must include the selected text")
        if end > len(content):
            return error("replacement range is outside document content")

        original_text = content[start:end]
        if selection["selected_text"] not in original_text:
            return error("selected text no longer appears in replacement range")

        cursor = connection.execute(
            """
            INSERT INTO edit_proposals (
                selection_id, document_id, replacement_start_offset, replacement_end_offset,
                original_text, proposed_text, rationale, scope_type
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                selection["id"],
                selection["document_id"],
                start,
                end,
                original_text,
                proposed_text,
                rationale,
                scope_type,
            ),
        )
        connection.commit()
        proposal_id = cursor.lastrowid
        proposal = row_to_dict(
            connection.execute(
                """
                SELECT id, selection_id, document_id, replacement_start_offset, replacement_end_offset,
                       original_text, proposed_text, rationale, scope_type, status, created_at, decided_at
                FROM edit_proposals
                WHERE id = ?
                """,
                (proposal_id,),
            ).fetchone()
        )

    return {"proposal": proposal}


TOOLS = {
    "list_projects": {
        "description": "List workspace projects.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "handler": list_projects,
    },
    "list_documents": {
        "description": "List documents in a project.",
        "inputSchema": {
            "type": "object",
            "properties": {"project_id": {"type": "integer"}},
            "required": ["project_id"],
            "additionalProperties": False,
        },
        "handler": list_documents,
    },
    "get_project_context": {
        "description": "Read project context for review generation, including documents, Knowledge materials, recent selections/proposals, current review, and memory.",
        "inputSchema": {
            "type": "object",
            "properties": {"project_id": {"type": "integer"}},
            "required": ["project_id"],
            "additionalProperties": False,
        },
        "handler": get_project_context,
    },
    "get_project_review": {
        "description": "Read the current project review and fixed-length memory.",
        "inputSchema": {
            "type": "object",
            "properties": {"project_id": {"type": "integer"}},
            "required": ["project_id"],
            "additionalProperties": False,
        },
        "handler": get_project_review,
    },
    "save_project_review": {
        "description": "Save the current project-level review generated by Codex.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer"},
                "title": {"type": "string"},
                "content": {"type": "string"},
                "created_by": {"type": "string"},
            },
            "required": ["project_id", "content"],
            "additionalProperties": False,
        },
        "handler": save_project_review,
    },
    "save_project_memory": {
        "description": "Save compressed project memory. Content must be compressed to max_chars, default and maximum 12000.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer"},
                "content": {"type": "string"},
                "source_summary": {"type": "string"},
                "max_chars": {"type": "integer"},
            },
            "required": ["project_id", "content"],
            "additionalProperties": False,
        },
        "handler": save_project_memory,
    },
    "list_materials": {
        "description": "List Knowledge materials in a project. Use before editing when project facts or uploaded materials may matter.",
        "inputSchema": {
            "type": "object",
            "properties": {"project_id": {"type": "integer"}},
            "required": ["project_id"],
            "additionalProperties": False,
        },
        "handler": list_materials,
    },
    "read_material": {
        "description": "Read extractable text from a Knowledge material. Supports text files, Markdown, DOCX, PPTX, and PDF.",
        "inputSchema": {
            "type": "object",
            "properties": {"material_id": {"type": "integer"}},
            "required": ["material_id"],
            "additionalProperties": False,
        },
        "handler": read_material,
    },
    "render_material_pages": {
        "description": "Render PDF Knowledge material pages to PNG images for visual inspection of layout, screenshots, charts, and image-only content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "material_id": {"type": "integer"},
                "pages": {"type": "array", "items": {"type": "integer"}},
                "dpi": {"type": "integer"},
                "max_pages": {"type": "integer"},
            },
            "required": ["material_id"],
            "additionalProperties": False,
        },
        "handler": render_material_pages,
    },
    "get_selection": {
        "description": "Read a saved text selection, its instruction, surrounding context, document, and project.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "selection_id": {"type": "integer"},
                "ticket_code": {"type": "string"},
            },
            "additionalProperties": False,
        },
        "handler": get_selection,
    },
    "search_project": {
        "description": "Search documents and material filenames in a project.",
        "inputSchema": {
            "type": "object",
            "properties": {"project_id": {"type": "integer"}, "query": {"type": "string"}},
            "required": ["project_id", "query"],
            "additionalProperties": False,
        },
        "handler": search_project,
    },
    "create_edit_proposal": {
        "description": (
            "Create an edit proposal for a selection. Does not modify document text. Default to replacing only the selected "
            "text; use wider offsets only when the user explicitly allows a wider edit."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "selection_id": {"type": "integer"},
                "ticket_code": {"type": "string"},
                "proposed_text": {"type": "string"},
                "rationale": {"type": "string"},
                "scope_type": {"type": "string", "enum": ["selection_only", "expanded"]},
                "replacement_start_offset": {"type": "integer"},
                "replacement_end_offset": {"type": "integer"},
            },
            "required": ["proposed_text"],
            "additionalProperties": False,
        },
        "handler": create_edit_proposal,
    },
}


def tool_descriptions() -> list[dict[str, Any]]:
    return [
        {
            "name": name,
            "description": spec["description"],
            "inputSchema": spec["inputSchema"],
        }
        for name, spec in TOOLS.items()
    ]


def handle_request(request: dict[str, Any]) -> dict[str, Any] | None:
    method = request.get("method")
    request_id = request.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": SERVER_INFO,
            },
        }

    if method == "notifications/initialized":
        return None

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": tool_descriptions()}}

    if method == "tools/call":
        params = request.get("params", {})
        tool_name = params.get("name")
        arguments = params.get("arguments", {})
        tool = TOOLS.get(tool_name)
        if tool is None:
            result = error(f"Unknown tool: {tool_name}")
            is_error = True
        else:
            result = tool["handler"](arguments)
            is_error = "error" in result
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}],
                "isError": is_error,
            },
        }

    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"},
    }


def main() -> None:
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    initialize_database()
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            response = handle_request(request)
        except Exception as exc:
            response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32603, "message": str(exc)},
            }
        if response is not None:
            print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
