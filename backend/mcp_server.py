import json
import sys
from typing import Any

from app.database import get_connection, initialize_database


SERVER_INFO = {"name": "personal-ai-workspace", "version": "0.1.0"}
PROTOCOL_VERSION = "2024-11-05"


def row_to_dict(row: Any) -> dict[str, Any] | None:
    return dict(row) if row else None


def error(message: str) -> dict[str, Any]:
    return {"error": message}


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
            "Create an edit proposal. Use scope_type='selection_only' when the selected text alone can be "
            "replaced smoothly. Use scope_type='expanded' and explain the rationale when nearby text must be "
            "changed together for fluency."
        ),
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
        "description": "Create an edit proposal for a selection. Does not modify document text.",
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
