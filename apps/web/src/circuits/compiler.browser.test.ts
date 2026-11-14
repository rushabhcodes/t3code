import { expect, it } from "vite-plus/test";
import { compileCircuit, circuitDiagnostics } from "./compiler";
import { circuitTemplates } from "./templates";
import { convertCircuitJsonToGerberFiles } from "circuit-json-to-gerber";
import { bomCsv } from "./exports";

it.each(circuitTemplates)(
  "compiles $name in the bundled worker and produces fabrication files",
  async (template) => {
    const files: Record<string, string> =
      template.id === "led"
        ? {
            "main.tsx": 'import Board from "./circuits/Board"; export default Board;',
            "circuits/Board.tsx": template.source,
          }
        : { "main.tsx": template.source };
    const json = await compileCircuit(files, "main.tsx", new AbortController().signal);
    expect(json.find((item) => item.type === "pcb_board")).toBeDefined();
    expect(
      circuitDiagnostics(json).filter((item) => item.severity === "error"),
      template.name,
    ).toEqual([]);
    if (template.id === "led") {
      expect(json.filter((item) => item.type === "source_component")).toHaveLength(3);
      const gerbers = convertCircuitJsonToGerberFiles(json);
      expect(Object.keys(gerbers).some((name) => /F_Cu|F\.Cu|gtl/i.test(name))).toBe(true);
      expect(Object.values(gerbers).some((text) => text.includes("M02*"))).toBe(true);
      expect(bomCsv(json)).toContain('"R1"');
    }
  },
);

it("reports invalid TSX and terminates a cancelled worker", async () => {
  await expect(
    compileCircuit(
      { "main.tsx": "export default () => <board broken" },
      "main.tsx",
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  const controller = new AbortController();
  const pending = compileCircuit({ "main.tsx": "while (true) {}" }, "main.tsx", controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow("cancelled");
});
