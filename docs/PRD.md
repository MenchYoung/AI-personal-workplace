# Personal AI Workspace PRD

## Purpose

Build a local-first personal research workspace where projects, goals, plans, materials, documents, revisions, and reviews are saved as durable context for controlled AI assistance.

## Phase 0 Goal

Create the smallest runnable application shell:

- A React frontend with a Projects page.
- A FastAPI backend with a health endpoint.
- SQLite initialized locally.
- A local `storage/` directory prepared for future uploaded materials.

## Product Principle

The workspace is project-first rather than file-first. AI assistance should eventually operate through narrow, reviewable actions such as section edits and plan creation rather than full-document overwrites.
