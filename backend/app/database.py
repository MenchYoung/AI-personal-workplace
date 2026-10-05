from pathlib import Path
import random
import sqlite3


ROOT_DIR = Path(__file__).resolve().parents[2]
STORAGE_DIR = ROOT_DIR / "storage"
DATABASE_PATH = STORAGE_DIR / "workspace.db"
TICKET_RANDOM = random.SystemRandom()


def get_connection() -> sqlite3.Connection:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def generate_selection_ticket_code(connection: sqlite3.Connection) -> str:
    used_codes = {
        row["ticket_code"]
        for row in connection.execute(
            "SELECT ticket_code FROM document_selections WHERE ticket_code IS NOT NULL"
        ).fetchall()
    }
    available_two_digit_codes = [str(code) for code in range(10, 100) if str(code) not in used_codes]
    if available_two_digit_codes:
        return TICKET_RANDOM.choice(available_two_digit_codes)

    for _ in range(1000):
        code = str(TICKET_RANDOM.randint(100, 999))
        if code not in used_codes:
            return code

    raise RuntimeError("No selection ticket codes are available")


def initialize_database() -> None:
    with get_connection() as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS materials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                original_filename TEXT NOT NULL,
                stored_path TEXT NOT NULL,
                content_type TEXT NOT NULL DEFAULT '',
                size_bytes INTEGER NOT NULL DEFAULT 0,
                uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                section TEXT NOT NULL,
                parent_folder_id INTEGER,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (parent_folder_id) REFERENCES folders(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS document_selections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_code TEXT,
                document_id INTEGER NOT NULL,
                start_offset INTEGER NOT NULL,
                end_offset INTEGER NOT NULL,
                selected_text TEXT NOT NULL,
                before_context TEXT NOT NULL DEFAULT '',
                after_context TEXT NOT NULL DEFAULT '',
                document_updated_at TEXT NOT NULL,
                instruction TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                archived_at TEXT,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS edit_proposals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                selection_id INTEGER NOT NULL,
                document_id INTEGER NOT NULL,
                replacement_start_offset INTEGER NOT NULL,
                replacement_end_offset INTEGER NOT NULL,
                original_text TEXT NOT NULL,
                proposed_text TEXT NOT NULL,
                rationale TEXT NOT NULL DEFAULT '',
                scope_type TEXT NOT NULL DEFAULT 'selection_only',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                decided_at TEXT,
                FOREIGN KEY (selection_id) REFERENCES document_selections(id) ON DELETE CASCADE,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS project_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL UNIQUE,
                title TEXT NOT NULL DEFAULT 'Project Review',
                content TEXT NOT NULL DEFAULT '',
                created_by TEXT NOT NULL DEFAULT 'codex',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS project_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL UNIQUE,
                content TEXT NOT NULL DEFAULT '',
                max_chars INTEGER NOT NULL DEFAULT 12000,
                source_summary TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )
        folder_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(folders)").fetchall()
        }
        if "parent_folder_id" not in folder_columns:
            connection.execute("ALTER TABLE folders ADD COLUMN parent_folder_id INTEGER")
        selection_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(document_selections)").fetchall()
        }
        if "ticket_code" not in selection_columns:
            connection.execute("ALTER TABLE document_selections ADD COLUMN ticket_code TEXT")
        if "archived_at" not in selection_columns:
            connection.execute("ALTER TABLE document_selections ADD COLUMN archived_at TEXT")
        missing_ticket_rows = connection.execute(
            """
            SELECT id
            FROM document_selections
            WHERE ticket_code IS NULL OR ticket_code = ''
            ORDER BY id
            """
        ).fetchall()
        for row in missing_ticket_rows:
            connection.execute(
                "UPDATE document_selections SET ticket_code = ? WHERE id = ?",
                (generate_selection_ticket_code(connection), row["id"]),
            )
        connection.commit()
