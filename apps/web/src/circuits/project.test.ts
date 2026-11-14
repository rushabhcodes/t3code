import { describe, expect, it } from "vite-plus/test";
import { createProject, insertComponent, parseProject, serializeProject } from "./project";

describe("portable circuit projects", () => {
  it("round trips multiple source files and the selected entry point without sharing mutable files", () => {
    const project = createProject("led", "Desk light");
    project.files["components/Indicator.tsx"] =
      'export const Indicator = () => <led name="D2" footprint="0603" />';
    project.activeFile = "components/Indicator.tsx";
    const reopened = parseProject(serializeProject(project), "desk-light.tsci.json");
    expect(reopened).toEqual(project);
    reopened.files["main.tsx"] = "edited";
    expect(project.files["main.tsx"]).not.toBe("edited");
    const imported = parseProject(project.files["main.tsx"] ?? "", "desk-light.tsx");
    expect(imported.files["main.tsx"]).toBe(project.files["main.tsx"]);
    expect(imported.name).toBe("desk-light");
  });

  it("rejects corrupt projects, unsupported versions, missing entry points, and unsafe file paths", () => {
    const valid = JSON.parse(serializeProject(createProject("blank"))) as Record<string, unknown>;
    for (const data of [
      { ...valid, version: 2 },
      { ...valid, name: "" },
      { ...valid, files: [] },
      { ...valid, entrypoint: "missing.tsx" },
      { ...valid, files: { "../main.tsx": "" } },
      { ...valid, files: { "/main.tsx": "" } },
      { ...valid, files: { "main.tsx": 1 } },
      { ...valid, files: { "main.tsx": "", "a\\b.tsx": "" } },
      { ...valid, files: { "main.tsx": "", "a/./b.tsx": "" } },
    ])
      expect(() => parseProject(JSON.stringify(data), "project.tsci.json")).toThrow();
    expect(() => parseProject("{broken", "project.tsci.json")).toThrow("valid JSON");
    expect(() => parseProject(" ".repeat(2 * 1024 * 1024 + 1), "large.tsx")).toThrow(
      "larger than 2 MB",
    );
  });

  it("inserts new components inside the board with a non-conflicting reference", () => {
    const source = '<board><resistor name="R1" /><resistor name="R3" /></board>';
    const inserted = insertComponent(source, "R", (name) => `<resistor name="${name}" />`);
    expect(inserted.name).toBe("R2");
    expect(inserted.source).toContain('<resistor name="R2" />\n  </board>');
    expect(() => insertComponent("export const value = 1", "R", () => "")).toThrow("<board>");
  });
});
