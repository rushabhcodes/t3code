import { circuitTemplates, type TemplateId } from "./templates";
import * as SecureRandom from "effect/crypto/SecureRandom";

export interface CircuitProject {
  id: string;
  name: string;
  entrypoint: string;
  files: Record<string, string>;
  activeFile: string;
  updatedAt: string;
}

export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 100;

export function validateFileName(name: string) {
  return (
    name.length > 0 &&
    name.length <= 180 &&
    !name.startsWith("/") &&
    !name.includes("\\") &&
    name.split("/").every((part) => part !== "" && part !== "." && part !== "..") &&
    /^[\w./-]+\.(tsx?|jsx?|json|md)$/.test(name)
  );
}

export function createProject(templateId: TemplateId, name?: string): CircuitProject {
  const template = circuitTemplates.find((item) => item.id === templateId) ?? circuitTemplates[0];
  return {
    id: SecureRandom.uuidV4Unsafe(),
    name: name?.trim().slice(0, 80) || template.name,
    entrypoint: "main.tsx",
    files: { "main.tsx": template.source },
    activeFile: "main.tsx",
    updatedAt: new Date().toISOString(),
  };
}

export function serializeProject(project: CircuitProject) {
  return JSON.stringify({ format: "tsci-code", version: 1, ...project }, null, 2) + "\n";
}

export function parseProject(text: string, filename: string): CircuitProject {
  if (new TextEncoder().encode(text).length > MAX_PROJECT_BYTES) {
    throw new Error("This file is larger than 2 MB. Open a smaller circuit project.");
  }
  if (/\.(tsx|jsx)$/i.test(filename)) {
    const project = createProject("blank", filename.replace(/\.(tsx|jsx)$/i, ""));
    project.files = { "main.tsx": text };
    return project;
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This isn’t valid JSON. Choose a .tsci.json project or a .tsx circuit.");
  }
  if (
    typeof data !== "object" ||
    data === null ||
    !("format" in data) ||
    data.format !== "tsci-code" ||
    !("version" in data) ||
    data.version !== 1
  ) {
    throw new Error(
      "This isn’t a TSCI Code project. Choose a .tsci.json project or a .tsx circuit.",
    );
  }
  if (
    !("name" in data) ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 80 ||
    !("files" in data) ||
    typeof data.files !== "object" ||
    data.files === null ||
    Array.isArray(data.files)
  ) {
    throw new Error("The project has an invalid name or file list.");
  }
  const entries = Object.entries(data.files);
  if (
    entries.length === 0 ||
    entries.length > MAX_FILES ||
    entries.some(([name, content]) => !validateFileName(name) || typeof content !== "string")
  ) {
    throw new Error("Projects must have 1–100 text files with relative, supported filenames.");
  }
  const files = Object.fromEntries(entries) as Record<string, string>;
  if (
    !("entrypoint" in data) ||
    typeof data.entrypoint !== "string" ||
    !Object.hasOwn(files, data.entrypoint) ||
    !/\.(tsx|jsx)$/.test(data.entrypoint)
  ) {
    throw new Error("The entry point must be a .tsx or .jsx file in this project.");
  }
  const activeFile =
    "activeFile" in data &&
    typeof data.activeFile === "string" &&
    Object.hasOwn(files, data.activeFile)
      ? data.activeFile
      : data.entrypoint;
  return {
    id:
      "id" in data && typeof data.id === "string" && /^[\w-]{1,80}$/.test(data.id)
        ? data.id
        : SecureRandom.uuidV4Unsafe(),
    name: data.name.trim(),
    entrypoint: data.entrypoint,
    files,
    activeFile,
    updatedAt:
      "updatedAt" in data &&
      typeof data.updatedAt === "string" &&
      Number.isFinite(Date.parse(data.updatedAt))
        ? data.updatedAt
        : new Date().toISOString(),
  };
}

export function projectSlug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "circuit"
  );
}

export function insertComponent(
  source: string,
  prefix: string,
  makeCode: (name: string) => string,
) {
  const closingBoard = source.lastIndexOf("</board>");
  if (closingBoard === -1)
    throw new Error("Open a file containing a <board> before inserting a component.");
  let index = 1;
  while (new RegExp(`name=["']${prefix}${index}["']`).test(source)) index++;
  const name = `${prefix}${index}`;
  const before = source.slice(0, closingBoard).trimEnd();
  return { source: `${before}\n    ${makeCode(name)}\n  ${source.slice(closingBoard)}`, name };
}
