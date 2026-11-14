export async function saveArtifact(
  name: string,
  content: string | Blob,
  location: string | null = null,
) {
  const nativeSave = circuitFileBridge()?.saveCircuitFile;
  if (nativeSave) {
    const text =
      typeof content === "string"
        ? content
        : btoa(
            Array.from(new Uint8Array(await content.arrayBuffer()), (byte) =>
              String.fromCharCode(byte),
            ).join(""),
          );
    return await nativeSave({
      name,
      text,
      path: location,
      encoding: typeof content === "string" ? "utf8" : "base64",
    });
  }
  const blob =
    typeof content === "string"
      ? new Blob([content], {
          type: name.endsWith("tsx")
            ? "text/plain;charset=utf-8"
            : name.endsWith("csv")
              ? "text/csv;charset=utf-8"
              : name.endsWith("svg")
                ? "image/svg+xml"
                : "application/json",
        })
      : content;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { name, path: "" };
}

export function openAgentWorkspace() {
  const url = new URL(window.location.href);
  if (window.desktopBridge) url.hash = "/new";
  else {
    url.pathname = "/new";
    url.hash = "";
  }
  window.location.assign(url.href);
}
import { circuitFileBridge } from "./desktop";
