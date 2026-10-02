# Development Plan

## Phase 0: Runnable Skeleton

Status: complete

- Create React frontend.
- Create FastAPI backend.
- Initialize SQLite storage.
- Show an empty Projects page.
- Verify backend health.

## Phase 1: Project Workspace MVP

Status: complete

- Create, rename, and delete projects.
- Add project tabs for Goals, Plans, Tasks, Knowledge, Documents, and Reviews.
- Create Markdown documents.
- Upload files into local storage.
- Search project documents and material filenames.

## Phase 2: Text Selection And Reviewable Edits

Status: complete

- Keep the existing large document textarea.
- Let the user select any text range and click `Ask`.
- Save the selected text, offsets, surrounding context, and user instruction as a `selection_id`.
- Show saved selections in a right-side drawer.
- Let the instruction be edited after creation.
- Store proposed edits separately from the document.
- Require explicit `Accept` before replacing document text.

Acceptance checks:

- Selecting text shows a floating `Ask` control.
- Created selections remain visible after refreshing the page.
- The drawer shows selected text, instruction, context, and proposals.
- Accepting a proposal updates the document.
- Rejecting a proposal leaves the document unchanged.

## Phase 3: Codex MCP Interface

Status: implemented, requires Codex reload/new session to use the registered tool

- Expose a local stdio MCP server in `backend/mcp_server.py`.
- Let Codex list projects and documents.
- Let Codex read a saved `selection_id`.
- Let Codex search project text.
- Let Codex create an edit proposal without directly modifying the document.
- Keep final document changes behind the UI accept/reject step.

Acceptance checks:

- Codex can call `get_selection` with a saved selection id.
- Codex can create a proposal for that selection.
- The proposal appears in the document drawer.
- The user can accept or reject the proposal in the app.

## Phase 4: Version Management

Status: not started

- Save every accepted edit as a version.
- Compare versions.
- Roll back section-level changes.

## Phase 5: Structured Document Editing

Status: not started

- Split Markdown documents into logical sections.
- Let proposals target a paragraph or section instead of only character offsets.
- Show clearer side-by-side diffs before accepting changes.
- Preserve the current textarea flow while adding more structure underneath.
