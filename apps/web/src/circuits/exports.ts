import type { AnyCircuitElement } from "circuit-json";
import JSZip from "jszip";
import { projectSlug, type CircuitProject } from "./project";
import { saveArtifact } from "./files";

const csvCell = (value: string) =>
  `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;

export function bomCsv(json: AnyCircuitElement[]) {
  const rows = json
    .filter((item) => item.type === "source_component")
    .map((component) => [
      component.name,
      component.ftype,
      "resistance" in component
        ? `${component.resistance} ohm`
        : "capacitance" in component
          ? `${component.capacitance} F`
          : "",
      "manufacturer_part_number" in component
        ? String(component.manufacturer_part_number ?? "")
        : "",
    ]);
  return (
    [["Reference", "Type", "Value", "Manufacturer part number"], ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") + "\r\n"
  );
}

export async function exportCircuit(
  kind: "source" | "json" | "bom" | "gerber" | "schematic",
  project: CircuitProject,
  json: AnyCircuitElement[] | null,
) {
  const name = projectSlug(project.name);
  if (kind === "source") {
    const zip = new JSZip();
    for (const [path, text] of Object.entries(project.files)) zip.file(path, text);
    zip.file(
      "tscircuit.config.json",
      JSON.stringify({ mainEntrypoint: project.entrypoint }, null, 2),
    );
    zip.file(
      "package.json",
      JSON.stringify(
        {
          name,
          private: true,
          scripts: { dev: "tsci dev", build: "tsci build" },
          devDependencies: { tscircuit: "^0.0.3087" },
        },
        null,
        2,
      ),
    );
    return await saveArtifact(`${name}-source.zip`, await zip.generateAsync({ type: "blob" }));
  }
  if (!json) throw new Error("Run your circuit successfully before exporting this format.");
  if (kind === "json")
    return await saveArtifact(`${name}.circuit.json`, JSON.stringify(json, null, 2));
  if (kind === "bom") return await saveArtifact(`${name}-bom.csv`, bomCsv(json));
  if (kind === "schematic") {
    const { convertCircuitJsonToSchematicSvg } = await import("circuit-to-svg");
    return await saveArtifact(`${name}-schematic.svg`, convertCircuitJsonToSchematicSvg(json));
  }
  const { convertCircuitJsonToGerberFiles } = await import("circuit-json-to-gerber");
  const files = convertCircuitJsonToGerberFiles(json);
  const zip = new JSZip();
  for (const [path, text] of Object.entries(files)) zip.file(path, text);
  return await saveArtifact(`${name}-gerbers.zip`, await zip.generateAsync({ type: "blob" }));
}
