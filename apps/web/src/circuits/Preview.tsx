import { Component, lazy, Suspense, type ReactNode } from "react";
import type { AnyCircuitElement } from "circuit-json";
import { CircuitBoard, Maximize2, MousePointer2 } from "lucide-react";

const PcbViewer = lazy(() =>
  import("@tscircuit/pcb-viewer").then((module) => ({ default: module.PCBViewer })),
);
const SchematicViewer = lazy(() =>
  import("@tscircuit/schematic-viewer").then((module) => ({ default: module.SchematicViewer })),
);
const CadViewer = lazy(() => import("./Board3D").then((module) => ({ default: module.Board3D })));

export type PreviewTab = "pcb" | "schematic" | "3d" | "bom";

class PreviewBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  override state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  override render() {
    return this.state.error ? (
      <div className="tsci-preview-empty">
        <CircuitBoard size={32} />
        <h3>This view couldn’t load</h3>
        <p>Switch to another view, then try again. The source is safe.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}

export function Preview({
  json,
  tab,
  running,
  stale,
  buildId,
  onTabChange,
}: {
  json: AnyCircuitElement[] | null;
  tab: PreviewTab;
  running: boolean;
  stale: boolean;
  buildId: number;
  onTabChange: (tab: PreviewTab) => void;
}) {
  const components = json?.filter((item) => item.type === "source_component") ?? [];
  const board = json?.find((item) => item.type === "pcb_board");
  return (
    <section className="tsci-preview-pane" aria-label="Circuit preview">
      <div className="tsci-pane-toolbar">
        <div className="tsci-tabs" role="tablist" aria-label="Circuit views">
          {(
            [
              ["pcb", "PCB"],
              ["schematic", "Schematic"],
              ["3d", "3D"],
              ["bom", "BOM"],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === id}
              key={id}
              onClick={() => onTabChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="tsci-icon-button"
          aria-label="Expand circuit preview"
          onClick={(event) => {
            const pane = event.currentTarget.closest("section");
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            else void pane?.requestFullscreen().catch(() => {});
          }}
        >
          <Maximize2 size={14} />
        </button>
      </div>
      <div
        className={`tsci-preview-canvas ${tab === "bom" ? "tsci-preview-table" : ""}`}
        role="tabpanel"
        aria-label={`${tab} preview`}
      >
        {json ? (
          <PreviewBoundary key={`${tab}-${buildId}`}>
            <Suspense
              fallback={
                <div className="tsci-preview-empty">
                  <CircuitBoard size={28} />
                  <p>Loading {tab === "3d" ? "3D viewer" : `${tab} viewer`}…</p>
                </div>
              }
            >
              {tab === "pcb" ? (
                <PcbViewer circuitJson={json} renderer="canvas" />
              ) : tab === "schematic" ? (
                <SchematicViewer circuitJson={json} />
              ) : tab === "3d" ? (
                <div role="img" aria-label="Interactive 3D board">
                  <CadViewer circuitJson={json} autoRotateDisabled />
                </div>
              ) : (
                <table className="tsci-bom">
                  <caption>Bill of materials · {components.length} components</caption>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Type</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((component) => (
                      <tr key={component.source_component_id}>
                        <td>{component.name}</td>
                        <td>{component.ftype.replace("simple_", "")}</td>
                        <td>
                          {"resistance" in component
                            ? `${component.resistance} Ω`
                            : "capacitance" in component
                              ? `${component.capacitance} F`
                              : "n/a"}
                        </td>
                      </tr>
                    ))}
                    {components.length === 0 ? (
                      <tr>
                        <td colSpan={3}>Add a component to see it here.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              )}
            </Suspense>
          </PreviewBoundary>
        ) : (
          <div className="tsci-preview-empty">
            <div className="tsci-empty-chip">
              <CircuitBoard size={36} strokeWidth={1.2} />
            </div>
            <h3>{running ? "Bringing your circuit to life" : "Your next board starts here"}</h3>
            <p>
              {running
                ? "Compiling TypeScript and routing connections locally…"
                : "Run your circuit to see the schematic, PCB, and 3D model."}
            </p>
          </div>
        )}
        {running || stale ? (
          <span className="tsci-preview-badge">
            {running ? "Building…" : "Preview needs a rebuild"}
          </span>
        ) : null}
      </div>
      <div className="tsci-preview-footer">
        <span>
          <MousePointer2 size={12} />{" "}
          {tab === "3d"
            ? "Drag to rotate · right-drag to pan · scroll to zoom"
            : "Scroll to zoom · drag to pan"}
        </span>
        <span>{board ? `${board.width} × ${board.height} mm` : "Dimensions in mm"}</span>
      </div>
    </section>
  );
}
