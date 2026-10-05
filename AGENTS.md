# Project Agent Notes

This project includes a local MCP server named `personal_ai_workspace`.

When the user asks to process, handle, review, polish, revise, or check a saved selection such as `selection #27`, `Selection #27`, or `处理 selection #27`, treat the visible number as the selection ticket code unless the user explicitly says it is the internal database id.

1. Call `mcp__personal_ai_workspace.get_selection` with that `ticket_code`.
2. Read the returned selected text, instruction, surrounding context, document, project, and workflow.
3. Understand the selected text in context before writing anything.
4. If the selection or instruction depends on project facts, Knowledge, materials, slides, files, or database context, call `list_documents`, `search_project`, `list_materials`, and when needed `read_material` before proposing text. For PDF materials with important charts, screenshots, layout, certificates, or image-only content, call `render_material_pages` and inspect the rendered page images.
5. By default, only replace the selected text. Use `scope_type: "selection_only"` and do not change surrounding sentences unless the user explicitly asked for a wider edit.
6. Check whether the proposed selected-text replacement reads naturally in the surrounding context.
7. If nearby sentences would also need changes for best fluency but the user did not explicitly allow a wider edit, keep the proposal scoped to the selected text and explain the wider recommendation in `rationale`.

If only an internal id is available, use `selection_id`. The UI-facing random number is `ticket_code`.
Do not ask the user to paste the selection text unless the MCP tool is unavailable or returns an error.
Do not directly modify the document content for selection work. Create an edit proposal and let the user accept it in the web UI.

When the user asks to update, generate, or refresh project Reviews or Memory:

1. Call `mcp__personal_ai_workspace.get_project_context` for the project.
2. Inspect current review and current memory before writing.
3. Inspect relevant documents, folders, and Knowledge materials. Use material names, folder hierarchy, years, versions, and document purpose to reconcile facts across sources.
4. Call `read_material` when a material may affect the review. For PDF materials with important visual content, call `render_material_pages` and inspect the rendered page images.
5. Build an integrated current-state understanding instead of writing isolated material summaries.
6. When multiple materials mention the same fact with different statuses, decide the current fact from time order, version, file name, folder, and content. If newer or more authoritative material updates an older status, keep the latest resolved fact as current. Example: older material says `MICCAI` is under review; newer material says `MICCAI` is accepted; Review and Memory should treat `MICCAI` as accepted, not preserve both as equal facts.
7. Write a project-level review covering Knowledge contents, confirmed current facts, outdated facts replaced by newer materials when relevant, current progress, recent additions, completed work, missing work, and next steps.
8. Rewrite memory as a compressed summary instead of appending. Preserve project goals, confirmed current facts, important material contents, current progress, decisions, and unfinished work. Do not preserve outdated statuses as current facts.
9. Keep memory within 12000 characters.
10. Save with `save_project_review` and `save_project_memory`.
