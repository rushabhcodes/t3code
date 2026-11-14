import { wrap, releaseProxy } from "comlink";
import type { AnyCircuitElement } from "circuit-json";
import workerUrl from "@tscircuit/eval/worker-entrypoint?url";

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  type: string;
}

export function circuitDiagnostics(json: AnyCircuitElement[]): Diagnostic[] {
  return json
    .filter((item) => item.type.includes("error") || item.type.includes("warning"))
    .map((item) => ({
      severity: item.type.includes("error") ? "error" : "warning",
      message:
        "message" in item && typeof item.message === "string"
          ? item.message
          : item.type.replaceAll("_", " "),
      type: item.type,
    }));
}

export async function compileCircuit(
  files: Record<string, string>,
  entrypoint: string,
  signal: AbortSignal,
) {
  const url = new URL(workerUrl, window.location.href);
  url.searchParams.set("tsci-compiler", "1");
  const worker = new Worker(url, { type: "module", name: "tsci-circuit-compiler" });
  const compiler = wrap<{
    setPlatformConfigProperty: (property: string, value: boolean) => Promise<void>;
    executeWithFsMap: (input: {
      fsMap: Record<string, string>;
      mainComponentPath: string;
    }) => Promise<void>;
    renderUntilSettled: () => Promise<void>;
    getCircuitJson: () => Promise<AnyCircuitElement[]>;
  }>(worker);
  let rejectFailure: (error: Error) => void = () => {};
  const failure = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  const abort = () => {
    worker.terminate();
    rejectFailure(new DOMException("Build cancelled", "AbortError"));
  };
  signal.addEventListener("abort", abort, { once: true });
  worker.onerror = (event) =>
    rejectFailure(
      new Error(event.message || "The circuit compiler couldn’t start. Reload and try again."),
    );
  const timeout = window.setTimeout(() => {
    worker.terminate();
    rejectFailure(
      new Error(
        "Build stopped after 30 seconds. Check for loops or reduce the board’s routing complexity, then run again.",
      ),
    );
  }, 30_000);
  try {
    if (signal.aborted) abort();
    return await Promise.race([
      (async () => {
        await compiler.setPlatformConfigProperty("partsEngineDisabled", true);
        await compiler.executeWithFsMap({ fsMap: files, mainComponentPath: entrypoint });
        await compiler.renderUntilSettled();
        const json = await compiler.getCircuitJson();
        if (!json.some((item) => item.type === "pcb_board"))
          throw new Error(
            "No board found. Export a component containing a <board> from the entry point.",
          );
        return json;
      })(),
      failure,
    ]);
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    compiler[releaseProxy]();
    worker.terminate();
  }
}
