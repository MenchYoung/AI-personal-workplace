import React from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderPlus,
  FolderKanban,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import "./styles.css";

const API_BASE = "http://127.0.0.1:8000";
const PROJECT_SECTIONS = ["Goals", "Plans", "Tasks", "Knowledge", "Documents", "Reviews"] as const;

type SectionName = (typeof PROJECT_SECTIONS)[number];

type Project = {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type DocumentItem = {
  id: number;
  project_id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type Material = {
  id: number;
  project_id: number;
  original_filename: string;
  stored_path: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};

type FolderItem = {
  id: number;
  project_id: number;
  section: SectionName;
  parent_folder_id: number | null;
  name: string;
  created_at: string;
};

type SearchResults = {
  documents: DocumentItem[];
  materials: Material[];
};

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const error = (await response.json()) as { detail?: string };
      message = error.detail || message;
    } catch {
      // Keep the default message when the response is not JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function App() {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [cleaningCache, setCleaningCache] = React.useState(false);
  const [cacheMessage, setCacheMessage] = React.useState<string | null>(null);
  const [cacheError, setCacheError] = React.useState<string | null>(null);

  const loadProjects = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await requestJson<{ projects: Project[] }>("/api/projects");
      setProjects(data.projects);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadProjects();
  }, []);

  async function createProject(name: string, description: string) {
    const data = await requestJson<{ project: Project }>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    setProjects((current) => [data.project, ...current]);
    setSelectedProject(data.project);
  }

  async function updateProject(projectId: number, name: string, description: string) {
    const data = await requestJson<{ project: Project }>(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    setProjects((current) => current.map((project) => (project.id === projectId ? data.project : project)));
    setSelectedProject(data.project);
  }

  async function deleteProject(projectId: number) {
    await requestJson<{ status: string }>(`/api/projects/${projectId}`, { method: "DELETE" });
    setProjects((current) => current.filter((project) => project.id !== projectId));
    setSelectedProject(null);
  }

  async function cleanupGlobalStorage() {
    setCleaningCache(true);
    setCacheMessage(null);
    setCacheError(null);

    try {
      const result = await requestJson<{ deleted_count: number; deleted_bytes: number; deleted_files: string[] }>(
        "/api/cleanup-storage",
        { method: "POST" },
      );
      setCacheMessage(
        result.deleted_count === 0
          ? "Global storage cache is already clean."
          : `Cleaned ${result.deleted_count} orphan file(s), ${formatBytes(result.deleted_bytes)} freed.`,
      );
    } catch (cleanupError) {
      setCacheError(cleanupError instanceof Error ? cleanupError.message : "Unable to clean storage cache.");
    } finally {
      setCleaningCache(false);
    }
  }

  if (selectedProject) {
    return (
      <ProjectWorkspace
        project={selectedProject}
        onBack={() => {
          setSelectedProject(null);
          void loadProjects();
        }}
        onUpdateProject={updateProject}
        onDeleteProject={deleteProject}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Local Research Workspace</p>
          <h1>Personal AI Workspace</h1>
          <p className="subtitle">Project-first materials, plans, documents, and controlled AI edits.</p>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={loadProjects} aria-label="Refresh projects" title="Refresh projects">
            <RefreshCw size={18} />
          </button>
          <button
            className="icon-button danger-quiet"
            disabled={cleaningCache}
            onClick={() => void cleanupGlobalStorage()}
            aria-label="Clean global storage cache"
            title="Clean global storage cache"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <section className="projects-panel" aria-labelledby="projects-heading">
        <div className="panel-title-row">
          <div>
            <h2 id="projects-heading">Projects</h2>
            <p>Create a workspace for each application, research line, or writing project.</p>
          </div>
          <span>{loading ? "Loading" : `${projects.length} total`}</span>
        </div>

        <ProjectForm onSubmit={createProject} />

        {cacheMessage ? <div className="status-message success">{cacheMessage}</div> : null}
        {cacheError ? <div className="status-message error">Cache cleanup failed: {cacheError}</div> : null}
        {error ? <div className="status-message error">Backend unavailable: {error}</div> : null}
        {!error && loading ? <div className="status-message">Loading projects...</div> : null}

        {!error && !loading && projects.length === 0 ? (
          <div className="empty-state">
            <FolderKanban size={36} />
            <h3>No projects yet</h3>
            <p>Create your first project, such as 云程奖, to start collecting materials and documents.</p>
          </div>
        ) : null}

        {!error && projects.length > 0 ? (
          <div className="project-list">
            {projects.map((project) => (
              <button className="project-item" key={project.id} onClick={() => setSelectedProject(project)}>
                <div>
                  <h3>{project.name}</h3>
                  <p>{project.description || "No description"}</p>
                </div>
                <span>Updated {formatDate(project.updated_at)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ProjectForm({ onSubmit }: { onSubmit: (name: string, description: string) => Promise<void> }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim(), description.trim());
      setName("");
      setDescription("");
      setIsOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create project.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <div className="create-project-entry">
        <button className="primary-button" onClick={() => setIsOpen(true)} type="button">
          <Plus size={16} />
          Create
        </button>
      </div>
    );
  }

  return (
    <form className="create-project-form" onSubmit={handleSubmit}>
      <label>
        <span>Project name</span>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        <span>Description</span>
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="form-action-stack">
        <button className="primary-button" disabled={saving || !name.trim()} type="submit">
          <Plus size={16} />
          {saving ? "Creating" : "Create"}
        </button>
        <button
          className="secondary-button"
          onClick={() => {
            setIsOpen(false);
            setError(null);
          }}
          type="button"
        >
          Cancel
        </button>
        {error ? <span className="inline-error">{error}</span> : null}
      </div>
    </form>
  );
}

function ProjectWorkspace({
  project,
  onBack,
  onUpdateProject,
  onDeleteProject,
}: {
  project: Project;
  onBack: () => void;
  onUpdateProject: (projectId: number, name: string, description: string) => Promise<void>;
  onDeleteProject: (projectId: number) => Promise<void>;
}) {
  const [activeSection, setActiveSection] = React.useState<SectionName>("Documents");
  const [documents, setDocuments] = React.useState<DocumentItem[]>([]);
  const [materials, setMaterials] = React.useState<Material[]>([]);
  const [folders, setFolders] = React.useState<FolderItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = React.useState<number | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchResults>({ documents: [], materials: [] });
  const [sidebarWidth, setSidebarWidth] = React.useState(300);
  const workspaceGridRef = React.useRef<HTMLDivElement | null>(null);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;

  const loadProjectData = React.useCallback(async () => {
    setError(null);
    try {
      const [documentData, materialData, folderData] = await Promise.all([
        requestJson<{ documents: DocumentItem[] }>(`/api/projects/${project.id}/documents`),
        requestJson<{ materials: Material[] }>(`/api/projects/${project.id}/materials`),
        requestJson<{ folders: FolderItem[] }>(`/api/projects/${project.id}/folders`),
      ]);
      setDocuments(documentData.documents);
      setMaterials(materialData.materials);
      setFolders(folderData.folders);
      setSelectedDocumentId((current) => {
        if (current && documentData.documents.some((document) => document.id === current)) return current;
        return documentData.documents[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load project.");
    }
  }, [project.id]);

  React.useEffect(() => {
    void loadProjectData();
  }, [loadProjectData]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults({ documents: [], materials: [] });
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const data = await requestJson<SearchResults>(
          `/api/projects/${project.id}/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        setSearchResults(data);
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setError(searchError instanceof Error ? searchError.message : "Unable to search.");
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [project.id, query]);

  async function createDocument() {
    const data = await requestJson<{ document: DocumentItem }>(`/api/projects/${project.id}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled.md", content: "" }),
    });
    setDocuments((current) => [data.document, ...current]);
    setSelectedDocumentId(data.document.id);
    setActiveSection("Documents");
    setMessage("Document created.");
  }

  async function saveDocument(documentId: number, title: string, content: string) {
    const data = await requestJson<{ document: DocumentItem }>(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    setDocuments((current) => current.map((document) => (document.id === documentId ? data.document : document)));
    setMessage("Document saved.");
  }

  async function deleteDocument(documentId: number) {
    await requestJson<{ status: string }>(`/api/documents/${documentId}`, { method: "DELETE" });
    setDocuments((current) => current.filter((document) => document.id !== documentId));
    setSelectedDocumentId(null);
    setMessage("Document deleted.");
  }

  async function uploadMaterial(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const data = await requestJson<{ material: Material }>(`/api/projects/${project.id}/materials`, {
      method: "POST",
      body: formData,
    });
    setMaterials((current) => [data.material, ...current]);
    setMessage("Material uploaded.");
  }

  async function deleteMaterial(materialId: number) {
    await requestJson<{ status: string }>(`/api/materials/${materialId}`, { method: "DELETE" });
    setMaterials((current) => current.filter((material) => material.id !== materialId));
    setMessage("Material deleted.");
  }

  async function cleanupStorage() {
    const result = await requestJson<{ deleted_count: number; deleted_bytes: number; deleted_files: string[] }>(
      `/api/projects/${project.id}/cleanup-storage`,
      { method: "POST" },
    );
    setMessage(
      result.deleted_count === 0
        ? "Storage cache is already clean."
        : `Cleaned ${result.deleted_count} orphan file(s), ${formatBytes(result.deleted_bytes)} freed.`,
    );
  }

  async function createFolder(section: SectionName, name: string, parentFolderId: number | null = null) {
    const data = await requestJson<{ folder: FolderItem }>(`/api/projects/${project.id}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, name, parent_folder_id: parentFolderId }),
    });
    setFolders((current) => [...current, data.folder]);
    setActiveSection(section);
    setMessage("Folder created.");
  }

  async function deleteFolder(folderId: number) {
    await requestJson<{ status: string }>(`/api/folders/${folderId}`, { method: "DELETE" });
    const collectDescendants = (id: number, allFolders: FolderItem[]): number[] =>
      allFolders
        .filter((folder) => folder.parent_folder_id === id)
        .flatMap((folder) => [folder.id, ...collectDescendants(folder.id, allFolders)]);

    setFolders((current) => {
      const deletedIds = new Set([folderId, ...collectDescendants(folderId, current)]);
      return current.filter((folder) => !deletedIds.has(folder.id));
    });
    setMessage("Folder deleted.");
  }

  function startSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const grid = workspaceGridRef.current;
    if (!grid) return;

    const gridLeft = grid.getBoundingClientRect().left;

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextWidth = Math.min(520, Math.max(220, moveEvent.clientX - gridLeft));
      setSidebarWidth(nextWidth);
    }

    function stopPointerMove() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPointerMove);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPointerMove);
  }

  return (
    <main className="app-shell workspace-shell">
      <header className="project-header">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={16} />
          Projects
        </button>
        <ProjectSettings
          project={project}
          onUpdateProject={onUpdateProject}
          onDeleteProject={onDeleteProject}
        />
      </header>

      <section className="project-title-block">
        <div>
          <p className="eyebrow">Project Workspace</p>
          <h1>{project.name}</h1>
          <p className="subtitle">{project.description || "No description yet."}</p>
        </div>
        <div className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this project" />
        </div>
      </section>

      {error ? <div className="status-message error">{error}</div> : null}
      {message ? <div className="status-message success">{message}</div> : null}

      {query.trim() ? (
        <SearchPanel
          results={searchResults}
          onOpenDocument={(documentId) => {
            setSelectedDocumentId(documentId);
            setActiveSection("Documents");
            setQuery("");
          }}
          onOpenKnowledge={() => {
            setActiveSection("Knowledge");
            setQuery("");
          }}
        />
      ) : null}

      <div
        className="workspace-grid"
        ref={workspaceGridRef}
        style={{ gridTemplateColumns: `${sidebarWidth}px 10px minmax(0, 1fr)` }}
      >
        <ProjectTree
          activeSection={activeSection}
          documents={documents}
          folders={folders}
          materials={materials}
          selectedDocumentId={selectedDocumentId}
          onCreateFolder={createFolder}
          onDeleteFolder={deleteFolder}
          onOpenDocument={(documentId) => {
            setSelectedDocumentId(documentId);
            setActiveSection("Documents");
          }}
          onSelectSection={setActiveSection}
        />
        <div
          className="sidebar-resizer"
          onPointerDown={startSidebarResize}
          role="separator"
          aria-label="Resize project sidebar"
          aria-orientation="vertical"
        />

        <section className="workspace-panel">
          {activeSection === "Documents" ? (
            <DocumentsPanel
              documents={documents}
              selectedDocument={selectedDocument}
              onCreateDocument={createDocument}
              onSelectDocument={setSelectedDocumentId}
              onSaveDocument={saveDocument}
              onDeleteDocument={deleteDocument}
            />
          ) : null}
          {activeSection === "Knowledge" ? (
            <KnowledgePanel
              materials={materials}
              onCleanupStorage={cleanupStorage}
              onDelete={deleteMaterial}
              onUpload={uploadMaterial}
            />
          ) : null}
          {!["Documents", "Knowledge"].includes(activeSection) ? <PlaceholderPanel section={activeSection} /> : null}
        </section>
      </div>
    </main>
  );
}

function ProjectTree({
  activeSection,
  documents,
  folders,
  materials,
  selectedDocumentId,
  onCreateFolder,
  onDeleteFolder,
  onOpenDocument,
  onSelectSection,
}: {
  activeSection: SectionName;
  documents: DocumentItem[];
  folders: FolderItem[];
  materials: Material[];
  selectedDocumentId: number | null;
  onCreateFolder: (section: SectionName, name: string, parentFolderId?: number | null) => Promise<void>;
  onDeleteFolder: (folderId: number) => Promise<void>;
  onOpenDocument: (documentId: number) => void;
  onSelectSection: (section: SectionName) => void;
}) {
  const [expandedSections, setExpandedSections] = React.useState<Record<SectionName, boolean>>({
    Goals: false,
    Plans: false,
    Tasks: false,
    Knowledge: true,
    Documents: true,
    Reviews: false,
  });
  const [expandedFolders, setExpandedFolders] = React.useState<Record<number, boolean>>({});

  function toggleSection(section: SectionName) {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
    onSelectSection(section);
  }

  function foldersFor(section: SectionName, parentFolderId: number | null = null) {
    return folders.filter((folder) => folder.section === section && folder.parent_folder_id === parentFolderId);
  }

  async function handleCreateFolder(section: SectionName, parentFolderId: number | null = null) {
    const name = window.prompt(`New folder in ${section}`);
    if (!name?.trim()) return;
    await onCreateFolder(section, name.trim(), parentFolderId);
    if (parentFolderId !== null) {
      setExpandedFolders((current) => ({ ...current, [parentFolderId]: true }));
    }
  }

  async function handleDeleteFolder(folder: FolderItem) {
    if (!window.confirm(`Delete folder "${folder.name}" and its subfolders?`)) return;
    await onDeleteFolder(folder.id);
  }

  return (
    <nav className="project-tree" aria-label="Project file tree">
      {PROJECT_SECTIONS.map((section) => {
        const isExpanded = expandedSections[section];
        const sectionFolders = foldersFor(section);
        const canShowDocuments = section === "Documents";
        const canShowMaterials = section === "Knowledge";
        const hasChildren =
          sectionFolders.length > 0 ||
          (canShowDocuments && documents.length > 0) ||
          (canShowMaterials && materials.length > 0);

        return (
          <div className="tree-section" key={section}>
            <div className={section === activeSection ? "tree-section-row active" : "tree-section-row"}>
              <button className="tree-toggle" onClick={() => toggleSection(section)} title={`Toggle ${section}`}>
                {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              <button className="tree-label" onClick={() => onSelectSection(section)}>
                {section}
              </button>
              <button
                className="tree-action"
                onClick={() => void handleCreateFolder(section)}
                title={`New folder in ${section}`}
              >
                <FolderPlus size={15} />
              </button>
            </div>

            {isExpanded ? (
              <div className="tree-children">
                {sectionFolders.map((folder) => (
                  <FolderTreeNode
                    expandedFolders={expandedFolders}
                    folder={folder}
                    folders={folders}
                    key={folder.id}
                    onCreateFolder={handleCreateFolder}
                    onDeleteFolder={handleDeleteFolder}
                    section={section}
                    setExpandedFolders={setExpandedFolders}
                  />
                ))}

                {canShowDocuments
                  ? documents.map((document) => (
                      <button
                        className={selectedDocumentId === document.id ? "tree-file-row active" : "tree-file-row"}
                        key={document.id}
                        onClick={() => onOpenDocument(document.id)}
                      >
                        <span className="tree-spacer" />
                        <FileText size={15} />
                        <span>{document.title}</span>
                      </button>
                    ))
                  : null}

                {canShowMaterials
                  ? materials.map((material) => (
                      <button className="tree-file-row" key={material.id} onClick={() => onSelectSection("Knowledge")}>
                        <span className="tree-spacer" />
                        <FileText size={15} />
                        <span>{material.original_filename}</span>
                      </button>
                    ))
                  : null}

                {!hasChildren ? <div className="tree-empty-child">No files yet</div> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function FolderTreeNode({
  expandedFolders,
  folder,
  folders,
  onCreateFolder,
  onDeleteFolder,
  section,
  setExpandedFolders,
}: {
  expandedFolders: Record<number, boolean>;
  folder: FolderItem;
  folders: FolderItem[];
  onCreateFolder: (section: SectionName, parentFolderId: number | null) => Promise<void>;
  onDeleteFolder: (folder: FolderItem) => Promise<void>;
  section: SectionName;
  setExpandedFolders: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
}) {
  const isExpanded = expandedFolders[folder.id] ?? false;
  const childFolders = folders.filter((candidate) => candidate.parent_folder_id === folder.id);

  return (
    <div className="tree-folder">
      <div className="tree-folder-row">
        <button
          className="tree-folder-main"
          onClick={() => setExpandedFolders((current) => ({ ...current, [folder.id]: !current[folder.id] }))}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={15} />
          <span>{folder.name}</span>
        </button>
        <button
          className="tree-inline-action"
          onClick={() => void onCreateFolder(section, folder.id)}
          title={`New subfolder in ${folder.name}`}
        >
          <FolderPlus size={14} />
        </button>
        <button
          className="tree-inline-action danger"
          onClick={() => void onDeleteFolder(folder)}
          title={`Delete ${folder.name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {isExpanded ? (
        <div className="tree-nested-children">
          {childFolders.length > 0 ? (
            childFolders.map((child) => (
              <FolderTreeNode
                expandedFolders={expandedFolders}
                folder={child}
                folders={folders}
                key={child.id}
                onCreateFolder={onCreateFolder}
                onDeleteFolder={onDeleteFolder}
                section={section}
                setExpandedFolders={setExpandedFolders}
              />
            ))
          ) : (
            <div className="tree-empty-child nested">Empty folder</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ProjectSettings({
  project,
  onUpdateProject,
  onDeleteProject,
}: {
  project: Project;
  onUpdateProject: (projectId: number, name: string, description: string) => Promise<void>;
  onDeleteProject: (projectId: number) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description);

  React.useEffect(() => {
    setName(project.name);
    setDescription(project.description);
  }, [project]);

  if (!editing) {
    return (
      <div className="button-row">
        <button className="secondary-button" onClick={() => setEditing(true)}>
          <Pencil size={16} />
          Rename
        </button>
        <button
          className="danger-button"
          onClick={() => {
            if (window.confirm(`Delete project "${project.name}" and its local files?`)) {
              void onDeleteProject(project.id);
            }
          }}
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    );
  }

  return (
    <form
      className="project-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onUpdateProject(project.id, name, description).then(() => setEditing(false));
      }}
    >
      <input value={name} onChange={(event) => setName(event.target.value)} />
      <input value={description} onChange={(event) => setDescription(event.target.value)} />
      <button className="primary-button" type="submit" disabled={!name.trim()}>
        <Save size={16} />
        Save
      </button>
    </form>
  );
}

function DocumentsPanel({
  documents,
  selectedDocument,
  onCreateDocument,
  onSelectDocument,
  onSaveDocument,
  onDeleteDocument,
}: {
  documents: DocumentItem[];
  selectedDocument: DocumentItem | null;
  onCreateDocument: () => Promise<void>;
  onSelectDocument: (documentId: number) => void;
  onSaveDocument: (documentId: number, title: string, content: string) => Promise<void>;
  onDeleteDocument: (documentId: number) => Promise<void>;
}) {
  return (
    <div className="documents-layout">
      <aside className="document-list">
        <div className="panel-title-row compact">
          <h2>Documents</h2>
          <button className="icon-button small" onClick={() => void onCreateDocument()} title="New document">
            <Plus size={16} />
          </button>
        </div>
        {documents.length === 0 ? <p className="muted">No Markdown documents yet.</p> : null}
        {documents.map((document) => (
          <button
            className={selectedDocument?.id === document.id ? "document-row active" : "document-row"}
            key={document.id}
            onClick={() => onSelectDocument(document.id)}
          >
            <FileText size={16} />
            <span>{document.title}</span>
          </button>
        ))}
      </aside>
      <DocumentEditor document={selectedDocument} onSave={onSaveDocument} onDelete={onDeleteDocument} />
    </div>
  );
}

function DocumentEditor({
  document,
  onSave,
  onDelete,
}: {
  document: DocumentItem | null;
  onSave: (documentId: number, title: string, content: string) => Promise<void>;
  onDelete: (documentId: number) => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setTitle(document?.title ?? "");
    setContent(document?.content ?? "");
  }, [document]);

  if (!document) {
    return (
      <div className="empty-editor">
        <FileText size={34} />
        <h3>Select or create a document</h3>
        <p>Markdown documents live in SQLite for now, ready for section editing in Phase 2.</p>
      </div>
    );
  }

  return (
    <form
      className="document-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await onSave(document.id, title, content);
        } finally {
          setSaving(false);
        }
      }}
    >
      <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} />
      <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write Markdown here." />
      <div className="button-row end">
        <button
          className="danger-button"
          type="button"
          onClick={() => {
            if (window.confirm(`Delete document "${document.title}"?`)) {
              void onDelete(document.id);
            }
          }}
        >
          <Trash2 size={16} />
          Delete
        </button>
        <button className="primary-button" type="submit" disabled={saving || !title.trim()}>
          <Save size={16} />
          {saving ? "Saving" : "Save"}
        </button>
      </div>
    </form>
  );
}

function KnowledgePanel({
  materials,
  onCleanupStorage,
  onUpload,
  onDelete,
}: {
  materials: Material[];
  onCleanupStorage: () => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onDelete: (materialId: number) => Promise<void>;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [cleaning, setCleaning] = React.useState(false);

  return (
    <div>
      <div className="panel-title-row compact">
        <div>
          <h2>Knowledge</h2>
          <p>Store PDFs, Word files, slides, notes, and other project materials.</p>
        </div>
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={cleaning}
            onClick={async () => {
              setCleaning(true);
              try {
                await onCleanupStorage();
              } finally {
                setCleaning(false);
              }
            }}
            type="button"
          >
            <Trash2 size={16} />
            {cleaning ? "Cleaning" : "Clean cache"}
          </button>
          <label className="primary-button file-button">
            <Upload size={16} />
            {uploading ? "Uploading" : "Upload"}
            <input
              type="file"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  await onUpload(file);
                  event.target.value = "";
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        </div>
      </div>

      {materials.length === 0 ? (
        <div className="empty-state compact-empty">
          <Upload size={30} />
          <h3>No materials yet</h3>
          <p>Upload supporting files now; content parsing comes later.</p>
        </div>
      ) : (
        <div className="material-list">
          {materials.map((material) => (
            <article className="material-row" key={material.id}>
              <div>
                <h3>{material.original_filename}</h3>
                <p>
                  {material.content_type || "unknown type"} · {formatBytes(material.size_bytes)} ·{" "}
                  {formatDate(material.uploaded_at)}
                </p>
              </div>
              <div className="button-row">
                <a
                  className="secondary-button"
                  href={`${API_BASE}/api/materials/${material.id}/download`}
                  title="Download file"
                >
                  <Download size={16} />
                  Download
                </a>
                <button
                  className="danger-button"
                  onClick={() => {
                    if (window.confirm(`Delete material "${material.original_filename}"?`)) {
                      void onDelete(material.id);
                    }
                  }}
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchPanel({
  results,
  onOpenDocument,
  onOpenKnowledge,
}: {
  results: SearchResults;
  onOpenDocument: (documentId: number) => void;
  onOpenKnowledge: () => void;
}) {
  const count = results.documents.length + results.materials.length;

  return (
    <section className="search-results">
      <div className="panel-title-row compact">
        <h2>Search Results</h2>
        <span>{count} found</span>
      </div>
      {count === 0 ? <p className="muted">No matching documents or materials.</p> : null}
      {results.documents.length > 0 ? <h3>Documents</h3> : null}
      {results.documents.map((document) => (
        <button className="search-result-row" key={document.id} onClick={() => onOpenDocument(document.id)}>
          <FileText size={16} />
          <span>{document.title}</span>
        </button>
      ))}
      {results.materials.length > 0 ? <h3>Knowledge</h3> : null}
      {results.materials.map((material) => (
        <button className="search-result-row" key={material.id} onClick={onOpenKnowledge}>
          <Upload size={16} />
          <span>{material.original_filename}</span>
        </button>
      ))}
    </section>
  );
}

function PlaceholderPanel({ section }: { section: SectionName }) {
  return (
    <div className="empty-editor">
      <FolderKanban size={34} />
      <h3>{section}</h3>
      <p>This section is reserved for the next phases. Phase 1 keeps the workspace focused on documents and materials.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
