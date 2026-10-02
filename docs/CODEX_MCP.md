# Codex MCP Integration

This project exposes a local MCP-style stdio server for Codex-safe document editing.

## Purpose

Codex should be able to read project context and create edit proposals, but it should not directly overwrite document text.

The intended flow is:

```text
User selects text in the document editor
  -> workspace saves a selection_id
  -> Codex reads that selection and context
  -> Codex creates an edit proposal
  -> user accepts or rejects the proposal in the UI
```

## Server

Run from the `backend/` directory:

```powershell
.\.venv\Scripts\python.exe mcp_server.py
```

The server uses stdio JSON-RPC and reads/writes the same SQLite database as the FastAPI app.

## Tools

- `list_projects`
- `list_documents`
- `get_selection`
- `search_project`
- `create_edit_proposal`

## Editing Boundary

`create_edit_proposal` only creates a pending proposal. It does not modify the document.

The user must review the proposal in the web UI and click `Accept` before text is replaced.

Use:

- `scope_type = "selection_only"` when the selected text can be changed by itself.
- `scope_type = "expanded"` when Codex thinks adjacent text must be changed together for fluency.

When using `expanded`, include a clear `rationale` and replacement offsets that include the original selection.
