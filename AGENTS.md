# Project Agent Notes

This project includes a local MCP server named `personal_ai_workspace`.

When the user asks to process, handle, review, polish, revise, or check a saved selection such as `selection #27`, `Selection #27`, or `处理 selection #27`, treat the visible number as the selection ticket code unless the user explicitly says it is the internal database id.

1. Call `mcp__personal_ai_workspace.get_selection` with that `ticket_code`.
2. Read the returned selected text, instruction, surrounding context, document, and project.
3. Decide whether the edit can stay inside the selected text.
4. Call `mcp__personal_ai_workspace.create_edit_proposal`.
5. Use `scope_type: "selection_only"` when replacing only the selected text is enough.
6. Use `scope_type: "expanded"` when adjacent text should be changed together for fluency, and include a clear rationale.

If only an internal id is available, use `selection_id`. The UI-facing random number is `ticket_code`.
Do not ask the user to paste the selection text unless the MCP tool is unavailable or returns an error.
Do not directly modify the document content for selection work. Create an edit proposal and let the user accept it in the web UI.
