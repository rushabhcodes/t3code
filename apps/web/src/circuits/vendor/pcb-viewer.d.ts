// The editor uses the viewer's JSON interface; compiler and routing implementation types stay behind this boundary.
export declare const PCBViewer: import("react").ComponentType<{
  circuitJson: import("circuit-json").AnyCircuitElement[];
  height?: number;
  renderer?: "canvas" | "webgpu";
}>;
