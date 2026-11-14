import { contextBridge, ipcRenderer } from "electron";
import type { CircuitDesktopBridge, CircuitDesktopCommand } from "@t3tools/contracts";
import { OPEN_CIRCUIT_FILE_CHANNEL, SAVE_CIRCUIT_FILE_CHANNEL } from "./ipc/channels.ts";

// oxlint-disable-next-line t3code/no-global-process-runtime -- The sandboxed Electron preload supplies the host platform to the circuit renderer.
const platform = process.platform;
contextBridge.exposeInMainWorld("tsciDesktop", {
  platform,
  openCircuitFile: () => ipcRenderer.invoke(OPEN_CIRCUIT_FILE_CHANNEL),
  saveCircuitFile: (input) => ipcRenderer.invoke(SAVE_CIRCUIT_FILE_CHANNEL, input),
  onCommand: (listener) => {
    const handler = (_event: unknown, command: CircuitDesktopCommand) => listener(command);
    ipcRenderer.on("tsci:command", handler);
    return () => ipcRenderer.removeListener("tsci:command", handler);
  },
} satisfies CircuitDesktopBridge);
if (platform === "darwin")
  window.addEventListener(
    "DOMContentLoaded",
    () => document.documentElement.style.setProperty("--desktop-window-controls-inset", "90px"),
    { once: true },
  );
