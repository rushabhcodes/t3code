import { parseProject, serializeProject, type CircuitProject } from "./project";

export interface Workspace {
  projects: CircuitProject[];
  activeProjectId: string | null;
}

async function openDatabase() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("tsci-code", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Device storage is unavailable. Export your project to keep a copy."));
    request.onblocked = () =>
      reject(new Error("Close other TSCI Code windows, then reload to open device storage."));
  });
}

export async function loadWorkspace(): Promise<Workspace> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("workspace", "readonly");
      const request = transaction.objectStore("workspace").get("current");
      request.onsuccess = () => {
        try {
          const value: unknown = request.result;
          if (value === undefined) {
            resolve({ projects: [], activeProjectId: null });
            return;
          }
          if (
            typeof value !== "object" ||
            value === null ||
            !("projects" in value) ||
            !Array.isArray(value.projects)
          )
            throw new Error(
              "Saved workspace is invalid. Your exported projects can still be opened.",
            );
          const projects = value.projects.map((project: unknown) =>
            parseProject(JSON.stringify(project), "project.tsci.json"),
          );
          resolve({
            projects,
            activeProjectId:
              "activeProjectId" in value && typeof value.activeProjectId === "string"
                ? value.activeProjectId
                : (projects[0]?.id ?? null),
          });
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () =>
        reject(new Error("Couldn’t read saved projects. Reload to try again."));
    });
  } finally {
    db.close();
  }
}

export async function saveWorkspace(workspace: Workspace) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("workspace", "readwrite");
      transaction.objectStore("workspace").put(
        {
          projects: workspace.projects.map(
            (project) => JSON.parse(serializeProject(project)) as unknown,
          ),
          activeProjectId: workspace.activeProjectId,
        },
        "current",
      );
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(
          new Error(
            "Device storage is full or unavailable. Save a project file to keep your changes.",
          ),
        );
      transaction.onerror = () =>
        reject(new Error("Couldn’t save this draft. Save a project file to keep your changes."));
    });
  } finally {
    db.close();
  }
}

export function readPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(`tsci:${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(`tsci:${key}`, value);
  } catch {
    /* The workspace reports storage failures separately. */
  }
}
