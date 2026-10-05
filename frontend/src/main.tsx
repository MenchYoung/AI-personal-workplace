import React from "react";
import ReactDOM from "react-dom/client";
import {
  Archive,
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
  PanelRightOpen,
  RotateCcw,
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

type DocumentSelection = {
  id: number;
  ticket_code: string;
  document_id: number;
  start_offset: number;
  end_offset: number;
  selected_text: string;
  before_context: string;
  after_context: string;
  document_updated_at: string;
  instruction: string;
  created_at: string;
  archived_at: string | null;
  proposal_status: "unprocessed" | "pending" | "accepted";
};

type EditProposal = {
  id: number;
  selection_id: number;
  document_id: number;
  replacement_start_offset: number;
  replacement_end_offset: number;
  original_text: string;
  proposed_text: string;
  rationale: string;
  scope_type: "selection_only" | "expanded";
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  decided_at: string | null;
};

type SearchResults = {
  documents: DocumentItem[];
  materials: Material[];
};

type ProjectReview = {
  id: number;
  project_id: number;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type ProjectMemory = {
  id: number;
  project_id: number;
  content: string;
  max_chars: number;
  source_summary: string;
  updated_at: string;
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
  const [review, setReview] = React.useState<ProjectReview | null>(null);
  const [memory, setMemory] = React.useState<ProjectMemory | null>(null);
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
      const [reviewData, memoryData] = await Promise.all([
        requestJson<{ review: ProjectReview | null }>(`/api/projects/${project.id}/review`),
        requestJson<{ memory: ProjectMemory | null }>(`/api/projects/${project.id}/memory`),
      ]);
      setDocuments(documentData.documents);
      setMaterials(materialData.materials);
      setFolders(folderData.folders);
      setReview(reviewData.review);
      setMemory(memoryData.memory);
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

  async function saveProjectReview(title: string, content: string) {
    const data = await requestJson<{ review: ProjectReview }>(`/api/projects/${project.id}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, created_by: "manual" }),
    });
    setReview(data.review);
    setMessage("Review saved.");
  }

  async function saveProjectMemory(content: string, sourceSummary: string, maxChars: number) {
    const data = await requestJson<{ memory: ProjectMemory }>(`/api/projects/${project.id}/memory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, source_summary: sourceSummary, max_chars: maxChars }),
    });
    setMemory(data.memory);
    setMessage("Memory saved.");
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
          {activeSection === "Reviews" ? (
            <ReviewsPanel
              documents={documents}
              materials={materials}
              memory={memory}
              onSaveMemory={saveProjectMemory}
              onSaveReview={saveProjectReview}
              project={project}
              review={review}
            />
          ) : null}
          {!["Documents", "Knowledge", "Reviews"].includes(activeSection) ? <PlaceholderPanel section={activeSection} /> : null}
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
  const [selectionRange, setSelectionRange] = React.useState<{ start: number; end: number } | null>(null);
  const [askOpen, setAskOpen] = React.useState(false);
  const [askInstruction, setAskInstruction] = React.useState("");
  const [selectionSaving, setSelectionSaving] = React.useState(false);
  const [selectionError, setSelectionError] = React.useState<string | null>(null);
  const [createdSelection, setCreatedSelection] = React.useState<DocumentSelection | null>(null);
  const [selectionToolbarPosition, setSelectionToolbarPosition] = React.useState<{ x: number; y: number } | null>(null);
  const [selections, setSelections] = React.useState<DocumentSelection[]>([]);
  const [selectionDrawerOpen, setSelectionDrawerOpen] = React.useState(false);
  const [activeSelectionId, setActiveSelectionId] = React.useState<number | null>(null);
  const [selectionListError, setSelectionListError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const editorBodyRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setTitle(document?.title ?? "");
    setContent(document?.content ?? "");
    setSelectionRange(null);
    setAskOpen(false);
    setAskInstruction("");
    setSelectionError(null);
    setCreatedSelection(null);
    setSelectionToolbarPosition(null);
    setSelections([]);
    setSelectionDrawerOpen(false);
    setActiveSelectionId(null);
    setSelectionListError(null);
  }, [document]);

  const loadSelections = React.useCallback(async () => {
    if (!document) return;

    setSelectionListError(null);
    try {
      const data = await requestJson<{ selections: DocumentSelection[] }>(`/api/documents/${document.id}/selections`);
      setSelections(data.selections);
      setActiveSelectionId((current) => {
        if (current && data.selections.some((selection) => selection.id === current)) return current;
        return data.selections[0]?.id ?? null;
      });
    } catch (loadError) {
      setSelectionListError(loadError instanceof Error ? loadError.message : "Unable to load selections.");
    }
  }, [document]);

  React.useEffect(() => {
    void loadSelections();
  }, [loadSelections]);

  const selectedText = selectionRange ? content.slice(selectionRange.start, selectionRange.end) : "";
  const hasUnsavedContent = document ? title !== document.title || content !== document.content : false;

  function captureSelection(event?: React.SyntheticEvent<HTMLTextAreaElement>) {
    const textarea = textareaRef.current;
    if (!textarea || !document) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextSelectedText = content.slice(start, end);

    setSelectionError(null);
    setCreatedSelection(null);

    if (start === end || !nextSelectedText.trim()) {
      setSelectionRange(null);
      setAskOpen(false);
      setSelectionToolbarPosition(null);
      return;
    }

    setSelectionRange({ start, end });

    if (event?.nativeEvent instanceof MouseEvent && editorBodyRef.current) {
      const bodyRect = editorBodyRef.current.getBoundingClientRect();
      const nextX = Math.min(Math.max(event.nativeEvent.clientX - bodyRect.left, 12), bodyRect.width - 88);
      const nextY = Math.min(Math.max(event.nativeEvent.clientY - bodyRect.top - 52, 12), bodyRect.height - 52);
      setSelectionToolbarPosition({ x: nextX, y: nextY });
      return;
    }

    setSelectionToolbarPosition({ x: 14, y: 14 });
  }

  async function createSelection() {
    if (!document || !selectionRange || !selectedText.trim() || !askInstruction.trim()) return;

    setSelectionSaving(true);
    setSelectionError(null);
    setCreatedSelection(null);

    try {
      const data = await requestJson<{ selection: DocumentSelection }>(`/api/documents/${document.id}/selections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_offset: selectionRange.start,
          end_offset: selectionRange.end,
          selected_text: selectedText,
          instruction: askInstruction.trim(),
        }),
      });
      setCreatedSelection(data.selection);
      setSelections((current) => [data.selection, ...current.filter((selection) => selection.id !== data.selection.id)]);
      setActiveSelectionId(data.selection.id);
      setSelectionDrawerOpen(true);
      setAskOpen(false);
      setAskInstruction("");
    } catch (createError) {
      setSelectionError(createError instanceof Error ? createError.message : "Unable to create Ask.");
    } finally {
      setSelectionSaving(false);
    }
  }

  async function updateSelectionInstruction(selectionId: number, instruction: string) {
    const data = await requestJson<{ selection: DocumentSelection }>(`/api/selections/${selectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    });
    setSelections((current) => current.map((selection) => (selection.id === selectionId ? data.selection : selection)));
    setCreatedSelection(data.selection);
  }

  async function setSelectionArchived(selectionId: number, archived: boolean) {
    const action = archived ? "archive" : "unarchive";
    const data = await requestJson<{ selection: DocumentSelection }>(`/api/selections/${selectionId}/${action}`, {
      method: "POST",
    });
    setSelections((current) => current.map((selection) => (selection.id === selectionId ? data.selection : selection)));
    setActiveSelectionId(data.selection.id);
  }

  async function deleteSelection(selectionId: number) {
    await requestJson<{ status: string }>(`/api/selections/${selectionId}`, { method: "DELETE" });
    setSelections((current) => {
      const nextSelections = current.filter((selection) => selection.id !== selectionId);
      setActiveSelectionId((currentActiveId) => {
        if (currentActiveId !== selectionId) return currentActiveId;
        return nextSelections[0]?.id ?? null;
      });
      return nextSelections;
    });
    setCreatedSelection((current) => (current?.id === selectionId ? null : current));
  }

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
          setSelectionRange(null);
          setAskOpen(false);
          setCreatedSelection(null);
        } finally {
          setSaving(false);
        }
      }}
    >
      <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} />
      <div className="document-editor-body" ref={editorBodyRef}>
        <textarea
          ref={textareaRef}
          value={content}
          onBlur={captureSelection}
          onChange={(event) => {
            setContent(event.target.value);
            setSelectionRange(null);
            setAskOpen(false);
            setCreatedSelection(null);
            setSelectionToolbarPosition(null);
          }}
          onKeyUp={captureSelection}
          onMouseUp={captureSelection}
          onSelect={() => captureSelection()}
          placeholder="Write here."
        />
        {selectedText && selectionToolbarPosition ? (
          <div
            className={askOpen ? "ask-floating-panel open" : "ask-floating-panel"}
            style={{ left: selectionToolbarPosition.x, top: selectionToolbarPosition.y }}
          >
            {!askOpen ? (
              <>
                <button
                  className="ask-floating-button"
                  disabled={hasUnsavedContent}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setAskOpen(true)}
                  type="button"
                >
                  Ask
                </button>
                {hasUnsavedContent ? <span className="ask-floating-hint">Save first</span> : null}
              </>
            ) : (
              <div className="ask-floating-form">
                <div>
                  <p className="ask-selection-label">Selected text</p>
                  <p className="ask-selection-preview">{selectedText}</p>
                  <p className="ask-selection-meta">
                    Characters {selectionRange?.start} to {selectionRange?.end}
                  </p>
                </div>
                {hasUnsavedContent ? (
                  <span className="inline-error">Save the document before creating an Ask.</span>
                ) : (
                  <>
                    <label>
                      <span>What should Codex do?</span>
                      <textarea
                        autoFocus
                        value={askInstruction}
                        onChange={(event) => setAskInstruction(event.target.value)}
                        placeholder="Make this more formal, or emphasize the medical AI angle."
                      />
                    </label>
                    <div className="button-row end">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setAskOpen(false);
                          setAskInstruction("");
                          setSelectionError(null);
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="primary-button"
                        disabled={selectionSaving || !askInstruction.trim()}
                        onClick={() => void createSelection()}
                        type="button"
                      >
                        {selectionSaving ? "Creating" : "Create Ask"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
      {selectionError ? <div className="status-message error">{selectionError}</div> : null}
      {createdSelection ? (
        <div className="status-message success">
          Selection #{createdSelection.ticket_code} created. Codex can use this ticket later.
        </div>
      ) : null}
      <button
        className="selection-drawer-toggle"
        onClick={() => setSelectionDrawerOpen((current) => !current)}
        title="Show selections"
        type="button"
      >
        <PanelRightOpen size={16} />
        Selections
        <span>{selections.length}</span>
      </button>
      {selectionDrawerOpen ? (
        <SelectionDrawer
          activeSelectionId={activeSelectionId}
          error={selectionListError}
          onClose={() => setSelectionDrawerOpen(false)}
          onDocumentUpdated={async (updatedDocument) => {
            setTitle(updatedDocument.title);
            setContent(updatedDocument.content);
            await onSave(updatedDocument.id, updatedDocument.title, updatedDocument.content);
            await loadSelections();
            setSelectionRange(null);
            setAskOpen(false);
            setCreatedSelection(null);
            setSelectionToolbarPosition(null);
          }}
          onSelect={setActiveSelectionId}
          onSetArchived={setSelectionArchived}
          onDeleteSelection={deleteSelection}
          onUpdateInstruction={updateSelectionInstruction}
          selections={selections}
        />
      ) : null}
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

function SelectionDrawer({
  activeSelectionId,
  error,
  onClose,
  onDeleteSelection,
  onDocumentUpdated,
  onSelect,
  onSetArchived,
  onUpdateInstruction,
  selections,
}: {
  activeSelectionId: number | null;
  error: string | null;
  onClose: () => void;
  onDeleteSelection: (selectionId: number) => Promise<void>;
  onDocumentUpdated: (document: DocumentItem) => Promise<void>;
  onSelect: (selectionId: number) => void;
  onSetArchived: (selectionId: number, archived: boolean) => Promise<void>;
  onUpdateInstruction: (selectionId: number, instruction: string) => Promise<void>;
  selections: DocumentSelection[];
}) {
  const activeSelection = selections.find((selection) => selection.id === activeSelectionId) ?? selections[0] ?? null;
  const [openGroups, setOpenGroups] = React.useState({ pending: true, accepted: true, archived: false });
  const activeSelections = selections.filter((selection) => !selection.archived_at);
  const pendingSelections = activeSelections.filter((selection) => selection.proposal_status !== "accepted");
  const acceptedSelections = activeSelections.filter((selection) => selection.proposal_status === "accepted");
  const archivedSelections = selections.filter((selection) => selection.archived_at);

  function toggleGroup(group: "pending" | "accepted" | "archived") {
    setOpenGroups((current) => ({ ...current, [group]: !current[group] }));
  }

  return (
    <aside className="selection-drawer" aria-label="Document selections">
      <div className="panel-title-row compact">
        <div>
          <h2>Selections</h2>
          <p>{selections.length} saved for this document</p>
        </div>
        <button className="icon-button small" onClick={onClose} title="Close selections" type="button">
          <ChevronRight size={16} />
        </button>
      </div>

      {error ? <div className="status-message error">{error}</div> : null}
      {selections.length === 0 ? <p className="muted">No selections yet. Select text and click Ask to create one.</p> : null}

      {selections.length > 0 ? (
        <div className="selection-drawer-layout">
          <div className="selection-list">
            <SelectionGroup
              activeSelectionId={activeSelection?.id ?? null}
              count={pendingSelections.length}
              isOpen={openGroups.pending}
              label="未处理"
              onSelect={onSelect}
              onToggle={() => toggleGroup("pending")}
              selections={pendingSelections}
            />
            <SelectionGroup
              activeSelectionId={activeSelection?.id ?? null}
              count={acceptedSelections.length}
              isOpen={openGroups.accepted}
              label="已处理"
              onSelect={onSelect}
              onToggle={() => toggleGroup("accepted")}
              selections={acceptedSelections}
            />
            <SelectionGroup
              activeSelectionId={activeSelection?.id ?? null}
              count={archivedSelections.length}
              isOpen={openGroups.archived}
              label="归档"
              onSelect={onSelect}
              onToggle={() => toggleGroup("archived")}
              selections={archivedSelections}
            />
          </div>
          {activeSelection ? (
            <SelectionDetail
              onDeleteSelection={onDeleteSelection}
              onDocumentUpdated={onDocumentUpdated}
              onSetArchived={onSetArchived}
              onUpdateInstruction={onUpdateInstruction}
              selection={activeSelection}
            />
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function SelectionGroup({
  activeSelectionId,
  count,
  isOpen,
  label,
  onSelect,
  onToggle,
  selections,
}: {
  activeSelectionId: number | null;
  count: number;
  isOpen: boolean;
  label: string;
  onSelect: (selectionId: number) => void;
  onToggle: () => void;
  selections: DocumentSelection[];
}) {
  return (
    <section className="selection-group">
      <button className="selection-group-header" onClick={onToggle} type="button">
        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span>{label}</span>
        <small>{count}</small>
      </button>
      {isOpen ? (
        <div className="selection-group-items">
          {selections.length === 0 ? <p className="selection-group-empty">暂无</p> : null}
          {selections.map((selection) => (
            <button
              className={activeSelectionId === selection.id ? "selection-row active" : "selection-row"}
              key={selection.id}
              onClick={() => onSelect(selection.id)}
              title={`Selection #${selection.ticket_code}`}
              type="button"
            >
              #{selection.ticket_code}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SelectionDetail({
  onDeleteSelection,
  onDocumentUpdated,
  onSetArchived,
  onUpdateInstruction,
  selection,
}: {
  onDeleteSelection: (selectionId: number) => Promise<void>;
  onDocumentUpdated: (document: DocumentItem) => Promise<void>;
  onSetArchived: (selectionId: number, archived: boolean) => Promise<void>;
  onUpdateInstruction: (selectionId: number, instruction: string) => Promise<void>;
  selection: DocumentSelection;
}) {
  const [instruction, setInstruction] = React.useState(selection.instruction);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [proposals, setProposals] = React.useState<EditProposal[]>([]);
  const [proposalText, setProposalText] = React.useState("");
  const [proposalRationale, setProposalRationale] = React.useState("");
  const [proposalScope, setProposalScope] = React.useState<"selection_only" | "expanded">("selection_only");
  const [proposalSaving, setProposalSaving] = React.useState(false);
  const [proposalError, setProposalError] = React.useState<string | null>(null);
  const [actionSaving, setActionSaving] = React.useState(false);

  React.useEffect(() => {
    setInstruction(selection.instruction);
    setError(null);
    setSaved(false);
    setProposalText("");
    setProposalRationale("");
    setProposalScope("selection_only");
    setProposalError(null);
    setActionSaving(false);
  }, [selection]);

  React.useEffect(() => {
    async function loadProposals() {
      setProposalError(null);
      try {
        const data = await requestJson<{ proposals: EditProposal[] }>(`/api/selections/${selection.id}/proposals`);
        setProposals(data.proposals);
      } catch (loadError) {
        setProposalError(loadError instanceof Error ? loadError.message : "Unable to load proposals.");
      }
    }

    void loadProposals();
  }, [selection]);

  async function saveInstruction() {
    if (!instruction.trim()) return;

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onUpdateInstruction(selection.id, instruction.trim());
      setSaved(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update selection.");
    } finally {
      setSaving(false);
    }
  }

  async function createProposal() {
    if (!proposalText.trim()) return;

    setProposalSaving(true);
    setProposalError(null);
    try {
      const data = await requestJson<{ proposal: EditProposal }>(`/api/selections/${selection.id}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposed_text: proposalText,
          rationale: proposalRationale,
          scope_type: proposalScope,
        }),
      });
      setProposals((current) => [data.proposal, ...current]);
      setProposalText("");
      setProposalRationale("");
      setProposalScope("selection_only");
    } catch (createError) {
      setProposalError(createError instanceof Error ? createError.message : "Unable to create proposal.");
    } finally {
      setProposalSaving(false);
    }
  }

  async function decideProposal(proposalId: number, decision: "accept" | "reject") {
    setProposalError(null);
    try {
      const data = await requestJson<{ proposal: EditProposal; document?: DocumentItem }>(
        `/api/proposals/${proposalId}/${decision}`,
        { method: "POST" },
      );
      setProposals((current) => current.map((proposal) => (proposal.id === proposalId ? data.proposal : proposal)));
      if (decision === "accept" && data.document) {
        await onDocumentUpdated(data.document);
      }
    } catch (decisionError) {
      setProposalError(decisionError instanceof Error ? decisionError.message : `Unable to ${decision} proposal.`);
    }
  }

  async function toggleArchive() {
    setActionSaving(true);
    setError(null);
    try {
      await onSetArchived(selection.id, !selection.archived_at);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Unable to update archive status.");
    } finally {
      setActionSaving(false);
    }
  }

  async function removeSelection() {
    if (!window.confirm(`Delete ticket #${selection.ticket_code}? This releases the ticket number.`)) return;

    setActionSaving(true);
    setError(null);
    try {
      await onDeleteSelection(selection.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete selection.");
      setActionSaving(false);
    }
  }

  return (
    <article className="selection-detail">
      <div className="selection-detail-header">
        <div>
          <h3>Selection #{selection.ticket_code}</h3>
          <span>
            ID {selection.id} · {selection.start_offset}-{selection.end_offset}
          </span>
        </div>
        <div className="selection-detail-actions">
          <button className="secondary-button compact" disabled={actionSaving} onClick={() => void toggleArchive()} type="button">
            {selection.archived_at ? <RotateCcw size={14} /> : <Archive size={14} />}
            {selection.archived_at ? "Unarchive" : "Archive"}
          </button>
          <button className="danger-button compact" disabled={actionSaving} onClick={() => void removeSelection()} type="button">
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      <section>
        <h4>Selected text</h4>
        <p className="selection-text-block">{selection.selected_text}</p>
      </section>

      <section>
        <h4>Instruction</h4>
        <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} />
        <div className="button-row end">
          {saved ? <span className="status-inline">Saved</span> : null}
          {error ? <span className="inline-error">{error}</span> : null}
          <button
            className="primary-button"
            disabled={saving || !instruction.trim() || instruction.trim() === selection.instruction}
            onClick={() => void saveInstruction()}
            type="button"
          >
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </section>

      <section>
        <h4>Context</h4>
        <p className="selection-context-block">
          {selection.before_context}
          <mark>{selection.selected_text}</mark>
          {selection.after_context}
        </p>
      </section>

      <section>
        <h4>Draft proposal</h4>
        <div className="proposal-draft">
          <label>
            <span>Suggested replacement</span>
            <textarea
              value={proposalText}
              onChange={(event) => setProposalText(event.target.value)}
              placeholder="Write the improved version here. Codex will use this same proposal slot later."
            />
          </label>
          <label>
            <span>Reason</span>
            <textarea
              value={proposalRationale}
              onChange={(event) => setProposalRationale(event.target.value)}
              placeholder="Explain why this change is better, or why a wider edit is needed."
            />
          </label>
          <label className="proposal-scope-row">
            <span>Scope</span>
            <select value={proposalScope} onChange={(event) => setProposalScope(event.target.value as "selection_only" | "expanded")}>
              <option value="selection_only">Selected text only</option>
              <option value="expanded">Needs wider edit</option>
            </select>
          </label>
          <div className="button-row end">
            {proposalError ? <span className="inline-error">{proposalError}</span> : null}
            <button
              className="primary-button"
              disabled={proposalSaving || !proposalText.trim()}
              onClick={() => void createProposal()}
              type="button"
            >
              {proposalSaving ? "Creating" : "Create Proposal"}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h4>Proposals</h4>
        {proposals.length === 0 ? <p className="muted">No proposals yet.</p> : null}
        {proposals.map((proposal) => (
          <article className="proposal-card" key={proposal.id}>
            <div className="proposal-card-header">
              <strong>Proposal #{proposal.id}</strong>
              <span className={`proposal-status ${proposal.status}`}>{proposal.status}</span>
            </div>
            <div className="proposal-columns">
              <div>
                <h5>Original</h5>
                <p>{proposal.original_text}</p>
              </div>
              <div>
                <h5>Suggested</h5>
                <p>{proposal.proposed_text}</p>
              </div>
            </div>
            {proposal.rationale ? (
              <div>
                <h5>Reason</h5>
                <p>{proposal.rationale}</p>
              </div>
            ) : null}
            <p className="proposal-meta">
              {proposal.scope_type === "expanded" ? "Wider edit requested" : "Selected text only"} · Characters{" "}
              {proposal.replacement_start_offset}-{proposal.replacement_end_offset}
            </p>
            {proposal.status === "pending" ? (
              <div className="button-row end">
                <button className="secondary-button" onClick={() => void decideProposal(proposal.id, "reject")} type="button">
                  Reject
                </button>
                <button className="primary-button" onClick={() => void decideProposal(proposal.id, "accept")} type="button">
                  Accept
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </article>
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

function ReviewsPanel({
  documents,
  materials,
  memory,
  onSaveMemory,
  onSaveReview,
  project,
  review,
}: {
  documents: DocumentItem[];
  materials: Material[];
  memory: ProjectMemory | null;
  onSaveMemory: (content: string, sourceSummary: string, maxChars: number) => Promise<void>;
  onSaveReview: (title: string, content: string) => Promise<void>;
  project: Project;
  review: ProjectReview | null;
}) {
  const [promptVisible, setPromptVisible] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [editingReview, setEditingReview] = React.useState(false);
  const [reviewTitle, setReviewTitle] = React.useState(review?.title ?? "Project Review");
  const [reviewContent, setReviewContent] = React.useState(review?.content ?? "");
  const [reviewSaving, setReviewSaving] = React.useState(false);
  const [reviewError, setReviewError] = React.useState<string | null>(null);
  const [editingMemory, setEditingMemory] = React.useState(false);
  const [memoryContent, setMemoryContent] = React.useState(memory?.content ?? "");
  const [memorySourceSummary, setMemorySourceSummary] = React.useState(memory?.source_summary ?? "");
  const [memorySaving, setMemorySaving] = React.useState(false);
  const [memoryError, setMemoryError] = React.useState<string | null>(null);
  const memoryMaxChars = memory?.max_chars ?? 12000;
  const memoryLength = editingMemory ? memoryContent.length : (memory?.content.length ?? 0);
  const memoryOverLimit = memoryLength > memoryMaxChars;
  const codexPrompt = buildReviewPrompt(project, documents, materials, memoryMaxChars);

  React.useEffect(() => {
    if (editingReview) return;
    setReviewTitle(review?.title ?? "Project Review");
    setReviewContent(review?.content ?? "");
    setReviewError(null);
  }, [editingReview, review]);

  React.useEffect(() => {
    if (editingMemory) return;
    setMemoryContent(memory?.content ?? "");
    setMemorySourceSummary(memory?.source_summary ?? "");
    setMemoryError(null);
  }, [editingMemory, memory]);

  async function copyPrompt() {
    await navigator.clipboard.writeText(codexPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function saveReviewEdit() {
    const nextTitle = reviewTitle.trim();
    if (!nextTitle) {
      setReviewError("Review title is required.");
      return;
    }

    setReviewSaving(true);
    setReviewError(null);
    try {
      await onSaveReview(nextTitle, reviewContent);
      setEditingReview(false);
    } catch (saveError) {
      setReviewError(saveError instanceof Error ? saveError.message : "Unable to save review.");
    } finally {
      setReviewSaving(false);
    }
  }

  async function saveMemoryEdit() {
    if (memoryOverLimit) {
      setMemoryError(`Memory is ${memoryLength - memoryMaxChars} characters over the limit.`);
      return;
    }

    setMemorySaving(true);
    setMemoryError(null);
    try {
      await onSaveMemory(memoryContent, memorySourceSummary, memoryMaxChars);
      setEditingMemory(false);
    } catch (saveError) {
      setMemoryError(saveError instanceof Error ? saveError.message : "Unable to save memory.");
    } finally {
      setMemorySaving(false);
    }
  }

  return (
    <div className="reviews-panel">
      <div className="panel-title-row compact">
        <div>
          <h2>Reviews</h2>
          <p>Project review and compressed memory written by Codex through MCP.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={() => setPromptVisible((current) => !current)} type="button">
            {promptVisible ? "Hide Prompt" : "Generate Codex Prompt"}
          </button>
          {promptVisible ? (
            <button className="primary-button" onClick={() => void copyPrompt()} type="button">
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
        </div>
      </div>

      {promptVisible ? (
        <section className="review-prompt-block">
          <h3>Send this to Codex</h3>
          <pre>{codexPrompt}</pre>
        </section>
      ) : null}

      <section className="review-grid">
        <article className="review-card">
          <div className="review-card-header">
            <div>
              <h3>{editingReview ? "Edit Review" : review?.title ?? "Project Review"}</h3>
              <p>{review ? `Updated ${formatDate(review.updated_at)} by ${review.created_by}` : "No review yet."}</p>
            </div>
            <div className="button-row">
              {editingReview ? (
                <>
                  <button
                    className="secondary-button compact"
                    disabled={reviewSaving}
                    onClick={() => {
                      setEditingReview(false);
                      setReviewTitle(review?.title ?? "Project Review");
                      setReviewContent(review?.content ?? "");
                      setReviewError(null);
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={reviewSaving || !reviewTitle.trim()}
                    onClick={() => void saveReviewEdit()}
                    type="button"
                  >
                    {reviewSaving ? "Saving" : "Save"}
                  </button>
                </>
              ) : (
                <button className="secondary-button compact" onClick={() => setEditingReview(true)} type="button">
                  <Pencil size={14} />
                  Edit
                </button>
              )}
            </div>
          </div>
          {editingReview ? (
            <div className="review-edit-form">
              <label>
                <span>Title</span>
                <input value={reviewTitle} onChange={(event) => setReviewTitle(event.target.value)} />
              </label>
              <label>
                <span>Content</span>
                <textarea value={reviewContent} onChange={(event) => setReviewContent(event.target.value)} />
              </label>
              {reviewError ? <span className="inline-error">{reviewError}</span> : null}
            </div>
          ) : review?.content ? (
            <div className="review-content">{review.content}</div>
          ) : (
            <div className="empty-state compact-empty">
              <FolderKanban size={30} />
              <h3>No review yet</h3>
              <p>Generate a Codex prompt, send it to Codex, then refresh this page after Codex writes back.</p>
            </div>
          )}
        </article>

        <article className="review-card">
          <div className="review-card-header">
            <div>
              <h3>{editingMemory ? "Edit Memory" : "Memory"}</h3>
              <p>
                {memory ? `Updated ${formatDate(memory.updated_at)}` : "No memory yet."} · {memoryLength} / {memoryMaxChars}
              </p>
            </div>
            <div className="button-row">
              {editingMemory ? (
                <>
                  <button
                    className="secondary-button compact"
                    disabled={memorySaving}
                    onClick={() => {
                      setEditingMemory(false);
                      setMemoryContent(memory?.content ?? "");
                      setMemorySourceSummary(memory?.source_summary ?? "");
                      setMemoryError(null);
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={memorySaving || memoryOverLimit}
                    onClick={() => void saveMemoryEdit()}
                    type="button"
                  >
                    {memorySaving ? "Saving" : "Save"}
                  </button>
                </>
              ) : (
                <button className="secondary-button compact" onClick={() => setEditingMemory(true)} type="button">
                  <Pencil size={14} />
                  Edit
                </button>
              )}
            </div>
          </div>
          <div className="memory-meter" aria-label="Memory usage">
            <span
              className={memoryOverLimit ? "over-limit" : undefined}
              style={{ width: `${Math.min(100, (memoryLength / memoryMaxChars) * 100)}%` }}
            />
          </div>
          {editingMemory ? (
            <div className="review-edit-form memory-edit-form">
              <label>
                <span>Source Summary</span>
                <textarea
                  className="source-summary-input"
                  value={memorySourceSummary}
                  onChange={(event) => setMemorySourceSummary(event.target.value)}
                />
              </label>
              <label>
                <span>Memory</span>
                <textarea value={memoryContent} onChange={(event) => setMemoryContent(event.target.value)} />
              </label>
              {memoryOverLimit ? (
                <span className="inline-error">Memory is {memoryLength - memoryMaxChars} characters over the limit.</span>
              ) : null}
              {memoryError ? <span className="inline-error">{memoryError}</span> : null}
            </div>
          ) : (
            <>
              {memory?.source_summary ? (
                <section className="memory-source-summary">
                  <h4>Source Summary</h4>
                  <p>{memory.source_summary}</p>
                </section>
              ) : null}
              {memory?.content ? (
                <div className="review-content memory-content">{memory.content}</div>
              ) : (
                <p className="muted">Codex will compress project facts, progress, decisions, and next steps into this fixed memory.</p>
              )}
            </>
          )}
        </article>
      </section>
    </div>
  );
}

function buildReviewPrompt(project: Project, documents: DocumentItem[], materials: Material[], memoryMaxChars: number) {
  const documentList = documents.map((document) => `- ${document.id}: ${document.title}`).join("\n") || "- No documents yet";
  const materialList = materials.map((material) => `- ${material.id}: ${material.original_filename}`).join("\n") || "- No Knowledge materials yet";

  return `请使用 personal_ai_workspace MCP 更新项目 Review 和固定长度 Memory。

项目：#${project.id} ${project.name}
Memory 上限：${memoryMaxChars} 字符

请严格执行：
1. 调用 get_project_context 读取项目上下文、当前 Review、当前 Memory、最近 selections/proposals、folders 和 materials。
2. 查看 Documents 和 Knowledge：
Documents:
${documentList}

Knowledge:
${materialList}
3. 不要只逐份总结材料。你要做的是“事实归并”和“当前状态判断”：
   - 材料名称
   - 文件夹/section 关系
   - 年份、版本、时间顺序
   - Documents 里的写作内容
   - 当前 Review 和 Memory
   综合判断同一件事在不同材料里的状态变化，并输出当前最可信、最新的结论。
   如果旧材料说“MICCAI 再审/在投/待接收”，新材料说“MICCAI 已接收”，最终 Review 和 Memory 里应保留“MICCAI 已接收”，不要把旧状态和新状态并列成两个事实。
   只有当旧状态对解释项目过程有必要时，才在 Review 里简短说明；Memory 里优先保留当前事实。
4. 如果 Knowledge 材料会影响判断，请调用 list_materials 和 read_material 阅读相关材料。
   - read_material 现在支持 PDF 文本抽取。
   - 如果 read_material 返回了非空 text 且 warning 为 null，不要写“PDF 无法读取”或“服务不支持 PDF”。
   - 只有当 read_material 明确返回 warning 或空 text 时，才说明材料需要人工/视觉复核。
   - 如果 PDF 中的图表、截图、排版、证书图片或页面视觉信息会影响 Review，请调用 render_material_pages 渲染页面图片，并基于图片进行视觉检查。
5. 生成项目总览 Review，必须包括：
- Knowledge 部分有什么
- Knowledge 里可以确认的当前事实是什么
- 哪些旧信息已经被新材料覆盖
- 哪些材料是历史参考，哪些材料是当前重点
- 当前工作进度是什么
- 最近添加了什么
- 已完成什么
- 还缺什么
- 下一步建议
6. 更新固定长度 Memory，不要简单追加；请重新压缩总结旧 Memory 和新上下文。
7. Memory 必须保留项目目标、当前确认的关键事实、重要材料内容、当前进度、已做决策、未完成事项；被新材料覆盖的旧状态不要作为当前事实保存。
8. Memory 必须控制在 ${memoryMaxChars} 字符以内。
9. 调用 save_project_review 写回 Review。
10. 调用 save_project_memory 写回 Memory。

请不要让我手动粘贴项目内容，直接使用 MCP 工具读取和写回。`;
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
