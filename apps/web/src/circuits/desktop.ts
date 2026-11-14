import type { CircuitDesktopBridge } from "@t3tools/contracts";

declare global {
  interface Window {
    tsciDesktop?: CircuitDesktopBridge;
  }
}

export function circuitFileBridge() {
  return window.tsciDesktop ?? window.desktopBridge;
}
