import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircuitBoard,
  Code2,
  Command,
  Download,
  ExternalLink,
  FilePlus2,
  Files,
  FolderOpen,
  HelpCircle,
  Keyboard,
  Library,
  Lightbulb,
  Loader,
  Moon,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  Bot,
  Sun,
  Terminal,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import type { AnyCircuitElement } from "circuit-json";
import * as SecureRandom from "effect/crypto/SecureRandom";
import { CodeEditor } from "./CodeEditor";
import { Preview, type PreviewTab } from "./Preview";
import { Onboarding } from "./Onboarding";
import { StudioDialog } from "./Dialog";
import { compileCircuit, circuitDiagnostics, type Diagnostic } from "./compiler";
import {
  createProject,
  insertComponent,
  MAX_PROJECT_BYTES,
  parseProject,
  projectSlug,
  serializeProject,
  validateFileName,
  type CircuitProject,
} from "./project";
import {
  loadWorkspace,
  readPreference,
  saveWorkspace,
  writePreference,
  type Workspace,
} from "./persistence";
import { componentSnippets } from "./templates";
import { openAgentWorkspace, saveArtifact } from "./files";
import { exportCircuit } from "./exports";
import { circuitFileBridge } from "./desktop";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function Studio() {
  const [loaded, setLoaded] = useState<{ workspace: Workspace; temporary: boolean } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Recover the device's IndexedDB workspace before rendering editable projects.
  useEffect(() => {
    let disposed = false;
    void loadWorkspace()
      .then((workspace) => {
        if (!disposed) setLoaded({ workspace, temporary: false });
      })
      .catch((error: unknown) => {
        if (!disposed) setFailure(errorText(error));
      });
    return () => {
      disposed = true;
    };
  }, []);
  return loaded ? (
    <WorkspaceEditor initial={loaded.workspace} temporary={loaded.temporary} />
  ) : (
    <div className="tsci-app tsci-loading" data-theme="dark">
      <img src="/tsci-logo.svg" alt="TSCI Code" />
      <h1>{failure ? "Let’s recover your workspace." : "Opening your workspace"}</h1>
      <p>{failure ?? "Your next idea is right where you left it."}</p>
      {failure ? (
        <div className="tsci-loading-actions">
          <button
            type="button"
            className="tsci-button primary"
            onClick={() => window.location.reload()}
          >
            Retry recovery
          </button>
          <button
            type="button"
            className="tsci-button secondary"
            onClick={() =>
              setLoaded({ workspace: { projects: [], activeProjectId: null }, temporary: true })
            }
          >
            Start a temporary workspace
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface Build {
  projectId: string;
  source: string;
  status: "idle" | "building" | "ready" | "error";
  json: AnyCircuitElement[] | null;
  diagnostics: Diagnostic[];
  duration: number;
  id: number;
}

function useBuild(project: CircuitProject | null, autoRun: boolean, runRequest: number) {
  const [build, setBuild] = useState<Build>({
    projectId: "",
    source: "",
    status: "idle",
    json: null,
    diagnostics: [],
    duration: 0,
    id: 0,
  });
  const lastRunRequest = useRef(-1);
  const currentJob = useRef<AbortController | null>(null);
  const projectId = project?.id;
  const entrypoint = project?.entrypoint;
  const files = project?.files;
  const source = JSON.stringify([entrypoint, files]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Schedule, cancel, and dispose the external circuit compiler when its source or run request changes.
  useEffect(() => {
    if (!projectId || !entrypoint || !files || (!autoRun && lastRunRequest.current === runRequest))
      return;
    lastRunRequest.current = runRequest;
    const controller = new AbortController();
    currentJob.current = controller;
    const timer = window.setTimeout(
      () => {
        if (controller.signal.aborted) return;
        const started = performance.now();
        setBuild((previous) => ({
          ...previous,
          projectId: projectId,
          json: previous.projectId === projectId ? previous.json : null,
          status: "building",
          diagnostics: [],
        }));
        void compileCircuit(files, entrypoint, controller.signal)
          .then((json) => {
            if (controller.signal.aborted) return;
            const diagnostics = circuitDiagnostics(json);
            setBuild((previous) => ({
              projectId: projectId,
              source,
              status: diagnostics.some((item) => item.severity === "error") ? "error" : "ready",
              json,
              diagnostics,
              duration: performance.now() - started,
              id: previous.id + 1,
            }));
          })
          .catch((error: unknown) => {
            if (!controller.signal.aborted)
              setBuild((previous) => ({
                ...previous,
                projectId: projectId,
                status: "error",
                json: previous.projectId === projectId ? previous.json : null,
                diagnostics: [{ severity: "error", type: "compiler", message: errorText(error) }],
                duration: performance.now() - started,
              }));
          });
      },
      autoRun ? 550 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (currentJob.current === controller) currentJob.current = null;
    };
  }, [projectId, entrypoint, files, source, autoRun, runRequest]);
  return {
    ...build,
    json: build.projectId === project?.id ? build.json : null,
    stale: build.projectId !== project?.id || build.source !== source,
    cancel: () => {
      currentJob.current?.abort();
      setBuild((previous) =>
        previous.status === "building" ? { ...previous, status: "idle" } : previous,
      );
    },
  };
}

type Modal =
  | "new"
  | "tour"
  | "export"
  | "settings"
  | "help"
  | "palette"
  | "file"
  | "delete"
  | "agent"
  | null;

function WorkspaceEditor({ initial, temporary }: { initial: Workspace; temporary: boolean }) {
  const [workspace, setWorkspace] = useState(initial);
  const [modal, setModal] = useState<Modal>(initial.projects.length === 0 ? "tour" : null);
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    readPreference("theme", "dark") === "light" ? "light" : "dark",
  );
  const [autoRun, setAutoRun] = useState(() => readPreference("auto-run", "true") !== "false");
  const [sidebar, setSidebar] = useState<"files" | "library">("files");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("pcb");
  const [layout, setLayout] = useState<"split" | "code" | "preview">("split");
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [runRequest, setRunRequest] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [persisted, setPersisted] = useState(initial);
  const [storageFailure, setStorageFailure] = useState(temporary);
  const storage = storageFailure ? "error" : workspace === persisted ? "saved" : "saving";
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    temporary
      ? {
          text: "Temporary workspace: draft recovery is off. Save project files to keep your changes.",
          error: true,
        }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fileLocations = useRef(new Map<string, { path: string; source: boolean }>());
  const project =
    workspace.projects.find((item) => item.id === workspace.activeProjectId) ??
    workspace.projects[0] ??
    null;
  const activeFile = project?.activeFile ?? "main.tsx";
  const build = useBuild(project, autoRun, runRequest);
  const errors = build.diagnostics.filter((item) => item.severity === "error").length;
  const warnings = build.diagnostics.length - errors;
  const components = build.json?.filter((item) => item.type === "source_component").length ?? 0;
  const traces = build.json?.filter((item) => item.type === "source_trace").length ?? 0;
  const notify = (text: string, error = false) => setNotice({ text, error });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Persist workspace changes to IndexedDB; acknowledge only a completed transaction.
  useEffect(() => {
    if (temporary) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      void saveWorkspace(workspace)
        .then(() => {
          if (!disposed) {
            setPersisted(workspace);
            setStorageFailure(false);
          }
        })
        .catch((error: unknown) => {
          if (!disposed) {
            setStorageFailure(true);
            setNotice({ text: errorText(error), error: true });
          }
        });
    }, 400);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [workspace, temporary]);

  const beforeUnload = useEffectEvent((event: BeforeUnloadEvent) => {
    if (project && storage !== "saved") {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Warn before leaving while the device draft is uncommitted or storage has failed.
  useEffect(() => {
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  function updateProject(change: Partial<CircuitProject>) {
    if (!project) return;
    setWorkspace((current) => ({
      ...current,
      projects: current.projects.map((item) =>
        item.id === project.id ? { ...item, ...change, updatedAt: new Date().toISOString() } : item,
      ),
    }));
  }

  function addProject(next: CircuitProject, location?: { path: string; source: boolean }) {
    if (workspace.projects.length >= 20) {
      notify(
        "This workspace has 20 projects. Save and remove an older draft before adding another.",
        true,
      );
      return;
    }
    if (workspace.projects.some((item) => item.id === next.id))
      next = { ...next, id: SecureRandom.uuidV4Unsafe() };
    if (location?.path) fileLocations.current.set(next.id, location);
    setWorkspace((current) => ({
      projects: [...current.projects, next],
      activeProjectId: next.id,
    }));
    setModal(null);
    setRunRequest((value) => value + 1);
    setProblemsOpen(false);
    notify(`${next.name} is ready. Change a value to make it yours.`);
  }

  function editSource(value: string) {
    if (!project) return;
    const files = { ...project.files, [activeFile]: value };
    if (new TextEncoder().encode(JSON.stringify(files)).length > MAX_PROJECT_BYTES - 2048) {
      notify(
        "This project has reached the 2 MB limit. Remove unused files before adding more source.",
        true,
      );
      return;
    }
    updateProject({ files });
  }

  async function openFile() {
    const nativeOpen = circuitFileBridge()?.openCircuitFile;
    if (!nativeOpen) {
      input.current?.click();
      return;
    }
    try {
      const file = await nativeOpen();
      if (file)
        addProject(parseProject(file.text, file.name), {
          path: file.path,
          source: /\.[jt]sx$/.test(file.name),
        });
    } catch (error) {
      notify(errorText(error), true);
    }
  }

  async function saveProject(saveAs = false) {
    if (!project || busy) return;
    const snapshot = project;
    const location = fileLocations.current.get(snapshot.id);
    const asSource = location?.source && Object.keys(snapshot.files).length === 1 && !saveAs;
    setBusy(true);
    try {
      const saved = await saveArtifact(
        asSource
          ? (location.path.split(/[\\/]/).at(-1) ?? "main.tsx")
          : `${projectSlug(snapshot.name)}.tsci.json`,
        asSource ? (snapshot.files[snapshot.entrypoint] ?? "") : serializeProject(snapshot),
        saveAs || (location?.source && !asSource) ? null : (location?.path ?? null),
      );
      if (saved) {
        if (saved.path)
          fileLocations.current.set(snapshot.id, { path: saved.path, source: Boolean(asSource) });
        notify(saved.path ? `Saved ${saved.name}` : `Downloaded ${saved.name}`);
      }
    } catch (error) {
      notify(errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function exportDesign(kind: Parameters<typeof exportCircuit>[0]) {
    if (!project || busy) return;
    setBusy(true);
    try {
      const saved = await exportCircuit(
        kind,
        project,
        build.stale || build.status === "building" ? null : build.json,
      );
      if (saved) notify(`Exported ${saved.name}`);
    } catch (error) {
      notify(errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  const keydown = useEffectEvent((event: KeyboardEvent) => {
    if (event.isComposing || event.repeat || !(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      void saveProject(event.shiftKey);
    } else if (key === "k") {
      event.preventDefault();
      setModal("palette");
    } else if (key === "enter") {
      event.preventDefault();
      setRunRequest((value) => value + 1);
    } else if (key === "o") {
      event.preventDefault();
      void openFile();
    }
  });
  const desktopCommand = useEffectEvent(
    (command: import("@t3tools/contracts").CircuitDesktopCommand) => {
      if (command === "new") setModal("new");
      if (command === "open") void openFile();
      if (command === "save" || command === "save-as") void saveProject(command === "save-as");
      if (command === "run") setRunRequest((value) => value + 1);
      if (command === "guide") setModal("help");
    },
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Native application menus forward commands through the isolated preload bridge.
  useEffect(() => window.tsciDesktop?.onCommand(desktopCommand), []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Register native and browser keyboard commands for the workspace lifetime.
  useEffect(() => {
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  function selectProject(id: string) {
    setWorkspace((current) => ({ ...current, activeProjectId: id }));
    setRunRequest((value) => value + 1);
    setProblemsOpen(false);
  }
  function setAutoRunPreference(value: boolean) {
    if (!value) build.cancel();
    setAutoRun(value);
    writePreference("auto-run", String(value));
  }
  function setThemePreference(value: "dark" | "light") {
    setTheme(value);
    writePreference("theme", value);
  }

  return (
    <div className="tsci-app" data-theme={theme}>
      <input
        ref={input}
        className="tsci-hidden-input"
        type="file"
        accept=".tsci.json,.json,.tsx,.jsx"
        aria-label="Open a circuit project"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          if (file.size > MAX_PROJECT_BYTES) {
            notify("Choose a circuit file smaller than 2 MB.", true);
            return;
          }
          void file
            .text()
            .then((text) => addProject(parseProject(text, file.name)))
            .catch((error: unknown) => notify(errorText(error), true));
        }}
      />
      <header className="tsci-titlebar">
        <div className="tsci-titlebar-brand">
          <img src="/tsci-logo.svg" alt="" />
          <span>TSCI Code</span>
          <span className="tsci-titlebar-divider">/</span>
          <span className="tsci-muted">Circuit workspace</span>
        </div>
        <button type="button" className="tsci-command-trigger" onClick={() => setModal("palette")}>
          <Search size={13} />
          <span>Search commands…</span>
          <kbd>⌘ K</kbd>
        </button>
        <span className="tsci-titlebar-local">
          <span className="tsci-status-dot" /> Local workspace
        </span>
      </header>
      <div className="tsci-shell">
        <nav className="tsci-rail" aria-label="Workspace navigation">
          <button
            type="button"
            className="tsci-rail-logo"
            onClick={() => setModal("tour")}
            aria-label="TSCI Code getting started"
          >
            <img src="/tsci-logo.svg" alt="" />
          </button>
          <div className="tsci-rail-top">
            <button
              type="button"
              className={sidebar === "files" ? "active" : ""}
              onClick={() => setSidebar("files")}
              aria-label="Explorer"
            >
              <Files />
            </button>
            <button
              type="button"
              className={sidebar === "library" ? "active" : ""}
              onClick={() => setSidebar("library")}
              aria-label="Component library"
            >
              <Library />
            </button>
            {!window.tsciDesktop && import.meta.env.VITE_TSCI_STANDALONE !== "true" && (
              <button type="button" onClick={() => setModal("agent")} aria-label="Coding agents">
                <Bot />
              </button>
            )}
          </div>
          <div className="tsci-rail-bottom">
            <button type="button" onClick={() => setModal("help")} aria-label="Guide and shortcuts">
              <HelpCircle />
            </button>
            <button
              type="button"
              onClick={() => setModal("settings")}
              aria-label="Workspace settings"
            >
              <Settings2 />
            </button>
            <span className="tsci-avatar">TC</span>
          </div>
        </nav>
        <aside
          className="tsci-sidebar"
          aria-label={sidebar === "files" ? "Project explorer" : "Component library"}
        >
          <div className="tsci-sidebar-heading">
            <span>{sidebar === "files" ? "EXPLORER" : "COMPONENT LIBRARY"}</span>
            <button
              type="button"
              className="tsci-icon-button"
              aria-label="New circuit project"
              onClick={() => setModal("new")}
            >
              <Plus size={15} />
            </button>
          </div>
          {sidebar === "files" ? (
            <>
              <button
                type="button"
                className="tsci-project-switcher"
                onClick={() => setModal("palette")}
              >
                <span className="tsci-project-mark">
                  <CircuitBoard size={17} />
                </span>
                <span>
                  <strong>{project?.name ?? "Your workspace"}</strong>
                  <small>tscircuit project</small>
                </span>
                <ChevronDown size={14} />
              </button>
              <div className="tsci-files-heading">
                <span>
                  <ChevronDown size={12} /> SOURCE FILES
                </span>
                <button
                  type="button"
                  className="tsci-icon-button"
                  aria-label="New source file"
                  onClick={() => setModal("file")}
                  disabled={!project}
                >
                  <FilePlus2 size={14} />
                </button>
              </div>
              <div className="tsci-file-list">
                {Object.keys(project?.files ?? {}).map((name) => (
                  <button
                    type="button"
                    key={name}
                    className={`tsci-file-row ${activeFile === name ? "active" : ""}`}
                    aria-current={activeFile === name ? "page" : undefined}
                    onClick={() => updateProject({ activeFile: name })}
                  >
                    <span className="tsci-ts-icon">{name.endsWith("json") ? "{}" : "TS"}</span>
                    <span>{name}</span>
                    {name === project?.entrypoint ? <small>entry</small> : null}
                  </button>
                ))}
                {!project ? (
                  <p className="tsci-sidebar-empty">Create a circuit to start building.</p>
                ) : null}
              </div>
              <div className="tsci-sidebar-section">
                <div className="tsci-section-label">
                  PROJECTS <span>{workspace.projects.length}</span>
                </div>
                {workspace.projects.map((item) => (
                  <div
                    className={`tsci-recent-row ${item.id === project?.id ? "active" : ""}`}
                    key={item.id}
                  >
                    <button type="button" onClick={() => selectProject(item.id)}>
                      <CircuitBoard size={14} />
                      <span>{item.name}</span>
                    </button>
                    {item.id === project?.id ? (
                      <button
                        type="button"
                        className="tsci-icon-button"
                        aria-label={`Remove ${item.name} draft`}
                        onClick={() => setModal("delete")}
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </div>
                ))}
                <button type="button" className="tsci-new-project" onClick={() => setModal("new")}>
                  <Plus size={13} /> New circuit
                </button>
                <button type="button" className="tsci-new-project" onClick={() => void openFile()}>
                  <FolderOpen size={13} /> Open project or TSX
                </button>
              </div>
            </>
          ) : (
            <div className="tsci-library">
              <p>
                Small building blocks.
                <br />
                Endless possibilities.
              </p>
              <label className="tsci-section-label">PASSIVE COMPONENTS</label>
              {componentSnippets.map((item) => (
                <button
                  type="button"
                  className="tsci-library-item"
                  key={item.name}
                  disabled={!project}
                  onClick={() => {
                    if (!project) return;
                    try {
                      const inserted = insertComponent(
                        project.files[activeFile] ?? "",
                        item.prefix,
                        item.code,
                      );
                      editSource(inserted.source);
                      notify(
                        `Added ${inserted.name}. Set pcbX and pcbY to place it, then add traces.`,
                      );
                    } catch (error) {
                      notify(errorText(error), true);
                    }
                  }}
                >
                  <span className="tsci-component-symbol">
                    {item.prefix === "R" ? "─▱─" : item.prefix === "C" ? "─Ⅱ─" : "─▷─"}
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                  <Plus size={14} />
                </button>
              ))}
              <div className="tsci-library-tip">
                <Lightbulb size={16} />
                <p>
                  Each component needs a unique name. Connect its pins with{" "}
                  <code>&lt;trace&gt;</code> elements.
                </p>
              </div>
              <a
                className="tsci-text-link"
                href="https://docs.tscircuit.com"
                target="_blank"
                rel="noreferrer"
              >
                Explore tscircuit docs <ExternalLink size={12} />
              </a>
            </div>
          )}
          <div className="tsci-sidebar-tip">
            <div>
              <Zap size={14} />
              <span>CODE. CONNECT. CREATE.</span>
            </div>
            <p>
              Every great board starts
              <br />
              with a little curiosity.
            </p>
            <button type="button" onClick={() => setModal("help")}>
              Open the quick guide <ArrowRight size={12} />
            </button>
          </div>
        </aside>
        <main className="tsci-main">
          <div className="tsci-workspace-header">
            <div className="tsci-breadcrumb">
              <CircuitBoard size={16} />
              <span>{project?.name ?? "Welcome to your workbench"}</span>
              <ChevronRight size={13} />
              <span className="tsci-muted">{activeFile}</span>
            </div>
            <div className="tsci-header-actions">
              <span className="tsci-draft-status">
                {storage === "saved" ? (
                  <CheckCheck size={13} />
                ) : storage === "saving" ? (
                  <Loader size={13} />
                ) : (
                  <TriangleAlert size={13} />
                )}
                {storage === "saved"
                  ? "Draft saved"
                  : storage === "saving"
                    ? "Saving draft…"
                    : "Draft not saved"}
              </span>
              <button
                type="button"
                className="tsci-button secondary compact"
                disabled={!project || busy}
                onClick={() => void saveProject()}
              >
                <Save size={13} />
                Save
              </button>
              <button
                type="button"
                className="tsci-button secondary compact"
                disabled={!project}
                onClick={() => setModal("export")}
              >
                <Download size={13} />
                Export <ChevronDown size={11} />
              </button>
              <span className="tsci-action-divider" />
              <button
                type="button"
                className="tsci-button primary compact"
                disabled={!project || build.status === "building"}
                onClick={() => setRunRequest((value) => value + 1)}
              >
                <Play size={12} fill="currentColor" />
                {build.status === "building" ? "Building…" : "Run circuit"}
              </button>
            </div>
          </div>
          <div className="tsci-workspace-subheader">
            <div className="tsci-file-tab">
              <span className="tsci-ts-icon">TS</span>
              {activeFile}
              <span className="tsci-file-tab-dot" />
            </div>
            <div className="tsci-view-controls" role="group" aria-label="Editor layout">
              {(
                [
                  ["code", "Code"],
                  ["split", "Split"],
                  ["preview", "Preview"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={layout === value}
                  className={layout === value ? "selected" : ""}
                  onClick={() => setLayout(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="tsci-auto-run">
              <input
                type="checkbox"
                checked={autoRun}
                onChange={(event) => setAutoRunPreference(event.target.checked)}
              />
              <span className="tsci-switch" /> Auto-run
            </label>
          </div>
          <div className={`tsci-editing-area layout-${layout}`}>
            {layout !== "preview" ? (
              <section className="tsci-source-pane" aria-label="Circuit source">
                <div className="tsci-pane-toolbar">
                  <span>
                    <Code2 size={13} /> SOURCE
                  </span>
                  <div className="tsci-source-meta">
                    {project &&
                    activeFile !== project.entrypoint &&
                    /\.[jt]sx$/.test(activeFile) ? (
                      <button
                        type="button"
                        onClick={() => updateProject({ entrypoint: activeFile })}
                      >
                        Use as entry point
                      </button>
                    ) : (
                      <span>{project ? "TypeScript + JSX" : "Ready when you are"}</span>
                    )}
                    {project && activeFile !== project.entrypoint ? (
                      <button
                        type="button"
                        className="tsci-icon-button"
                        aria-label="Delete source file"
                        onClick={() => {
                          if (!window.confirm(`Delete ${activeFile} from this project?`)) return;
                          const files = { ...project.files };
                          delete files[activeFile];
                          updateProject({ files, activeFile: project.entrypoint });
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </div>
                </div>
                {project ? (
                  <CodeEditor
                    key={`${project.id}:${activeFile}`}
                    filename={activeFile}
                    value={project.files[activeFile] ?? ""}
                    theme={theme}
                    onChange={editSource}
                    onCursorChange={(line, column) => setCursor({ line, column })}
                  />
                ) : (
                  <div className="tsci-source-empty">
                    <Code2 size={28} />
                    <p>A place for your next idea.</p>
                    <button
                      type="button"
                      className="tsci-button primary"
                      onClick={() => setModal("new")}
                    >
                      Create a circuit <Plus size={14} />
                    </button>
                  </div>
                )}
                <div className="tsci-editor-footer">
                  <span>
                    Ln {cursor.line}, Col {cursor.column}
                  </span>
                  <span>
                    UTF-8 <span>·</span> TSX
                  </span>
                </div>
              </section>
            ) : null}
            {layout !== "code" ? (
              <Preview
                json={build.json}
                tab={previewTab}
                running={build.status === "building"}
                stale={build.stale}
                buildId={build.id}
                onTabChange={setPreviewTab}
              />
            ) : null}
          </div>
          <section
            className={`tsci-problems ${problemsOpen ? "expanded" : ""}`}
            aria-label="Build diagnostics"
          >
            <button
              type="button"
              className="tsci-problems-toggle"
              onClick={() => setProblemsOpen(!problemsOpen)}
              aria-expanded={problemsOpen}
            >
              <div>
                <Terminal size={13} />
                <strong>Problems</strong>
                <span className={`tsci-count ${errors ? "has-errors" : ""}`}>
                  {build.diagnostics.length}
                </span>
                <span className="tsci-problem-summary">
                  {build.status === "building"
                    ? "Compiling and routing…"
                    : errors
                      ? `${errors} issue${errors === 1 ? "" : "s"} to look at`
                      : warnings
                        ? `${warnings} warning${warnings === 1 ? "" : "s"} to review`
                        : build.stale
                          ? "Run to check the latest source"
                          : build.json
                            ? "Looking good. Your circuit is ready."
                            : "Build your circuit to check for issues"}
                </span>
              </div>
              <div>
                <span className="tsci-build-time">
                  {build.duration > 0 ? `Built in ${(build.duration / 1000).toFixed(2)}s` : ""}
                </span>
                <ChevronDown size={13} />
              </div>
            </button>
            {problemsOpen ? (
              <div className="tsci-problem-list" role="log">
                {build.diagnostics.length ? (
                  build.diagnostics.map((item) => (
                    <div className="tsci-diagnostic" key={`${item.type}-${item.message}`}>
                      <TriangleAlert size={14} />
                      <div>
                        <strong>{item.severity === "error" ? "Error" : "Warning"}</strong>
                        <p>{item.message}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="tsci-no-problems">
                    <Check size={15} />
                    {build.stale
                      ? "The source has changed. Run your circuit to check it."
                      : "No build problems. Review the schematic and PCB before manufacturing."}
                  </p>
                )}
              </div>
            ) : null}
          </section>
          <div className="tsci-workbench-footer">
            <div>
              <span className={`tsci-status-dot ${errors ? "error" : ""}`} />
              <span role="status" aria-label="Circuit build status">
                {build.status === "building"
                  ? "Building circuit"
                  : errors
                    ? "Build needs attention"
                    : build.stale
                      ? "Changes pending"
                      : build.json
                        ? "Circuit up to date"
                        : "Ready"}
              </span>
              <span className="tsci-footer-separator" />
              <span>{components} components</span>
              <span>{traces} connections</span>
            </div>
            <div>
              <span>tscircuit engine</span>
              <span className="tsci-footer-separator" />
              <button type="button" onClick={() => setModal("help")}>
                <Keyboard size={12} /> Shortcuts
              </button>
            </div>
          </div>
        </main>
      </div>
      {notice ? (
        <div
          className={`tsci-notice ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.error ? <TriangleAlert size={16} /> : <Check size={16} />}
          <span>{notice.text}</span>
          <button
            type="button"
            className="tsci-icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
      {modal === "new" || modal === "tour" ? (
        <Onboarding
          key={modal}
          mode={modal === "new" ? "new" : "onboarding"}
          onClose={project ? () => setModal(null) : undefined}
          onOpen={() => void openFile()}
          onCreate={(template, name) => addProject(createProject(template, name))}
        />
      ) : null}
      {modal === "file" ? (
        <NewFileDialog
          onClose={() => setModal(null)}
          onCreate={(name) => {
            if (!project) return;
            if (!validateFileName(name))
              throw new Error(
                "Use a relative filename ending in .tsx, .ts, .jsx, .js, .json, or .md.",
              );
            if (Object.hasOwn(project.files, name))
              throw new Error("A file with that name already exists.");
            if (Object.keys(project.files).length >= 100)
              throw new Error("Projects support up to 100 source files.");
            updateProject({
              files: { ...project.files, [name]: name.endsWith("json") ? "{}\n" : "" },
              activeFile: name,
            });
            setModal(null);
          }}
        />
      ) : null}
      {modal === "export" ? (
        <StudioDialog title="Export circuit" onClose={() => setModal(null)}>
          <div className="tsci-dialog-heading">
            <span className="tsci-eyebrow">FROM CODE TO COPPER</span>
            <h2>Take your circuit further.</h2>
            <p>Save a portable project, or choose a format for your next step.</p>
          </div>
          <div className="tsci-export-options">
            <ExportOption
              title="TSCI project"
              icon={<Save />}
              detail="All source files · .tsci.json · reopen in TSCI Code"
              disabled={busy}
              onClick={() => void saveProject(true)}
            />
            <ExportOption
              title="Source project"
              icon={<Code2 />}
              detail="TSX files + CLI configuration · .zip"
              disabled={busy}
              onClick={() => void exportDesign("source")}
            />
            <ExportOption
              title="Gerber fabrication files"
              icon={<CircuitBoard />}
              detail="Copper, mask, silkscreen, and drill files · .zip"
              disabled={busy || !build.json || build.stale || build.status !== "ready"}
              onClick={() => void exportDesign("gerber")}
            />
            <ExportOption
              title="Circuit JSON"
              icon={<Files />}
              detail="The compiled design · .circuit.json"
              disabled={busy || !build.json || build.stale || build.status === "building"}
              onClick={() => void exportDesign("json")}
            />
            <ExportOption
              title="Bill of materials"
              icon={<Box />}
              detail="Component references, types, and values · .csv"
              disabled={busy || !build.json || build.stale || build.status === "building"}
              onClick={() => void exportDesign("bom")}
            />
            <ExportOption
              title="Schematic SVG"
              icon={<LayersIcon />}
              detail="A vector drawing for documentation · .svg"
              disabled={busy || !build.json || build.stale || build.status === "building"}
              onClick={() => void exportDesign("schematic")}
            />
          </div>
          <p className="tsci-dialog-note">
            {build.stale || errors
              ? "Run the latest source and resolve build errors to enable fabrication exports."
              : "Review your board and your manufacturer’s design rules before ordering."}
          </p>
        </StudioDialog>
      ) : null}
      {modal === "settings" ? (
        <StudioDialog title="Workspace settings" onClose={() => setModal(null)}>
          <div className="tsci-dialog-heading">
            <span className="tsci-eyebrow">MAKE YOURSELF AT HOME</span>
            <h2>Your workbench, your way.</h2>
            <p>Preferences stay on this device.</p>
          </div>
          {project ? (
            <ProjectNameField
              key={project.id}
              name={project.name}
              onCommit={(name) => updateProject({ name })}
            />
          ) : null}
          <div className="tsci-setting-row">
            <div>
              <strong>Appearance</strong>
              <small>Choose the light that works for you.</small>
            </div>
            <div className="tsci-theme-options">
              <button
                type="button"
                aria-pressed={theme === "dark"}
                className={theme === "dark" ? "selected" : ""}
                onClick={() => setThemePreference("dark")}
              >
                <Moon size={15} /> Dark
              </button>
              <button
                type="button"
                aria-pressed={theme === "light"}
                className={theme === "light" ? "selected" : ""}
                onClick={() => setThemePreference("light")}
              >
                <Sun size={15} /> Light
              </button>
            </div>
          </div>
          <label className="tsci-setting-row">
            <div>
              <strong>Auto-run circuits</strong>
              <small>Rebuild after you stop typing.</small>
            </div>
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(event) => setAutoRunPreference(event.target.checked)}
            />
          </label>
          <div className="tsci-setting-row">
            <div>
              <strong>Local draft recovery</strong>
              <small>
                {temporary
                  ? "Unavailable in this temporary workspace."
                  : "Projects are kept in this device’s app storage."}
              </small>
            </div>
            <span className="tsci-setting-pill">{temporary ? "Off" : "On"}</span>
          </div>
          <p className="tsci-dialog-note">
            Save project files for backup or moving between devices. Clearing app data removes local
            drafts.
          </p>
        </StudioDialog>
      ) : null}
      {modal === "help" ? (
        <StudioDialog title="TSCI Code quick guide" onClose={() => setModal(null)}>
          <div className="tsci-dialog-heading">
            <span className="tsci-eyebrow">A LITTLE GUIDANCE GOES A LONG WAY</span>
            <h2>Meet your circuit workbench.</h2>
            <p>One source of truth. Every view of your design.</p>
          </div>
          <div className="tsci-help-steps">
            <div>
              <span>01</span>
              <p>
                <strong>Describe the circuit.</strong> Export a TSX component containing a{" "}
                <code>&lt;board&gt;</code>. Give every component a unique name, value, and
                footprint.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Connect and inspect.</strong> Use traces like{" "}
                <code>{'<trace from=".R1 > .pin2" to=".D1 > .pin1" />'}</code>. Place components
                with <code>pcbX</code> and <code>pcbY</code>; schematic positions use{" "}
                <code>schX</code> and <code>schY</code>.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Check, save, and export.</strong> Resolve Problems, review every view, and
                save a project file. Export Gerbers and a BOM when the design is ready.
              </p>
            </div>
          </div>
          <div className="tsci-shortcuts">
            {[
              ["Save project", "Ctrl / ⌘ S"],
              ["Save project as", "Ctrl / ⌘ Shift S"],
              ["Open project", "Ctrl / ⌘ O"],
              ["Run circuit", "Ctrl / ⌘ Enter"],
              ["Command palette", "Ctrl / ⌘ K"],
              ["Editor autocomplete", "Ctrl Space"],
            ].map(([label, shortcut]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{shortcut}</kbd>
              </div>
            ))}
          </div>
          <div className="tsci-help-links">
            <a href="https://docs.tscircuit.com" target="_blank" rel="noreferrer">
              <BookOpen size={14} /> tscircuit documentation <ExternalLink size={12} />
            </a>
            <button type="button" onClick={() => setModal("tour")}>
              Replay the welcome tour <ArrowRight size={13} />
            </button>
          </div>
        </StudioDialog>
      ) : null}
      {modal === "delete" && project ? (
        <StudioDialog title="Remove local draft" onClose={() => setModal(null)}>
          <div className="tsci-dialog-heading">
            <span className="tsci-eyebrow">LOCAL WORKSPACE</span>
            <h2>Remove “{project.name}”?</h2>
            <p>
              This removes its draft from this device. Save a project file first if you want to keep
              it. Files you already exported stay on disk.
            </p>
          </div>
          <div className="tsci-dialog-actions">
            <button type="button" className="tsci-button secondary" onClick={() => setModal(null)}>
              Keep draft
            </button>
            <button
              type="button"
              className="tsci-button danger"
              onClick={() => {
                const remaining = workspace.projects.filter((item) => item.id !== project.id);
                setWorkspace({ projects: remaining, activeProjectId: remaining[0]?.id ?? null });
                fileLocations.current.delete(project.id);
                setModal(remaining.length ? null : "new");
              }}
            >
              Remove draft
            </button>
          </div>
        </StudioDialog>
      ) : null}
      {modal === "agent" ? (
        <StudioDialog title="Coding agents" onClose={() => setModal(null)}>
          <div className="tsci-dialog-heading">
            <span className="tsci-eyebrow">A SECOND PAIR OF HANDS</span>
            <h2>Bring your coding agent.</h2>
            <p>
              The T3 agent workspace is included for deeper project work with Codex, Claude Code,
              and other supported agents.
            </p>
          </div>
          <div className="tsci-next-steps">
            <ol>
              <li>Export the source project and extract it into a folder.</li>
              <li>Open the agent workspace, connect an installed provider, and add that folder.</li>
              <li>Ask for a circuit change, then open the updated TSX in this editor.</li>
            </ol>
          </div>
          <p className="tsci-dialog-note">
            Agent access uses your own provider account. The circuit editor works without one.
            Finish saving the local draft before continuing.
          </p>
          <button
            type="button"
            className="tsci-button primary"
            disabled={storage === "saving"}
            onClick={openAgentWorkspace}
          >
            Open agent workspace <ExternalLink size={14} />
          </button>
        </StudioDialog>
      ) : null}
      {modal === "palette" ? (
        <CommandPalette
          onClose={() => setModal(null)}
          actions={[
            {
              label: "Run circuit",
              detail: "Ctrl/⌘ Enter",
              action: () => setRunRequest((value) => value + 1),
            },
            { label: "New circuit project", detail: "Create", action: () => setModal("new") },
            { label: "Open project or TSX", detail: "Ctrl/⌘ O", action: () => void openFile() },
            { label: "Save project", detail: "Ctrl/⌘ S", action: () => void saveProject() },
            {
              label: "Export design",
              detail: "Source · Gerber · BOM",
              action: () => setModal("export"),
            },
            {
              label: "Workspace settings",
              detail: "Preferences",
              action: () => setModal("settings"),
            },
            { label: "Quick guide and shortcuts", detail: "Learn", action: () => setModal("help") },
            ...workspace.projects.map((item) => ({
              label: `Open ${item.name}`,
              detail: "Project",
              action: () => selectProject(item.id),
            })),
          ]}
        />
      ) : null}
    </div>
  );
}

function LayersIcon() {
  return <Files />;
}

function ProjectNameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  return (
    <label className="tsci-field">
      Project name
      <input
        value={draft}
        maxLength={80}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim() || "Untitled circuit";
          setDraft(next);
          onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function ExportOption({
  icon,
  title,
  detail,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="tsci-export-option" disabled={disabled} onClick={onClick}>
      <span className="tsci-export-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <ArrowDownToLine size={15} />
    </button>
  );
}

function NewFileDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return (
    <StudioDialog title="New source file" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onCreate(name.trim());
          } catch (cause) {
            setError(errorText(cause));
          }
        }}
      >
        <div className="tsci-dialog-heading">
          <span className="tsci-eyebrow">ONE MORE BUILDING BLOCK</span>
          <h2>Add a source file.</h2>
          <p>Use relative imports to share components between files.</p>
        </div>
        <label className="tsci-field">
          Filename
          <input
            autoFocus
            placeholder="components/Indicator.tsx"
            value={name}
            maxLength={180}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error ? (
          <p className="tsci-form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="tsci-dialog-actions">
          <button type="button" className="tsci-button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="tsci-button primary">
            Create file <Plus size={14} />
          </button>
        </div>
      </form>
    </StudioDialog>
  );
}

function CommandPalette({
  actions,
  onClose,
}: {
  actions: { label: string; detail: string; action: () => void }[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const matches = actions.filter((action) =>
    `${action.label} ${action.detail}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <StudioDialog title="Search commands" className="tsci-palette" onClose={onClose}>
      <label className="tsci-palette-search">
        <Search size={18} />
        <input
          autoFocus
          placeholder="What would you like to do?"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((value) => Math.min(value + 1, matches.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((value) => Math.max(value - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              onClose();
              matches[selected]?.action();
            }
          }}
        />
      </label>
      <div className="tsci-palette-results">
        {matches.map((action, index) => (
          <button
            type="button"
            className={selected === index ? "selected" : ""}
            key={action.label}
            onClick={() => {
              onClose();
              action.action();
            }}
          >
            <Command size={14} />
            <span>{action.label}</span>
            <small>{action.detail}</small>
          </button>
        ))}
        {!matches.length ? <p>No matching commands. Try “export” or “project”.</p> : null}
      </div>
      <div className="tsci-palette-footer">
        <span>↑ ↓ to navigate</span>
        <span>↵ to select</span>
        <span>esc to close</span>
      </div>
    </StudioDialog>
  );
}
