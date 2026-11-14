import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { EditorView } from "@codemirror/view";
import { StrictMode } from "react";
import { render } from "../../test/render";
import { Studio } from "./Studio";
import { circuitTemplates } from "./templates";
import { compileCircuit } from "./compiler";
import { Preview } from "./Preview";
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./studio.css";
import "@tscircuit/pcb-viewer";
import "@tscircuit/schematic-viewer";
import "./Board3D";

async function clearWorkspace() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("tsci-code");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

it("onboards a user, blocks stale fabrication exports, and recovers the edited draft", async () => {
  await clearWorkspace();
  localStorage.removeItem("tsci:auto-run");
  await using _storage = { [Symbol.asyncDispose]: clearWorkspace };
  await page.viewport(1440, 900);
  const container = document.createElement("div");
  container.style.height = "100dvh";
  container.style.width = "100vw";
  // This independent circuit renderer has no route dependencies.
  await using screen = await render(<Studio />, { container, router: false });
  await expect.element(screen.getByRole("dialog", { name: "Welcome to TSCI Code" })).toBeVisible();
  await screen.getByRole("button", { name: "Let’s build something" }).click();
  await screen.getByRole("button", { name: "Continue", exact: true }).click();
  await screen.getByRole("textbox", { name: "Project name" }).fill("Desk light");
  await screen.getByRole("button", { name: "Create circuit" }).click();
  await expect
    .element(screen.getByRole("status", { name: "Circuit build status" }))
    .toHaveTextContent("Circuit up to date");
  await screen.getByRole("button", { name: "Dismiss notification" }).click();
  await screen.getByRole("tab", { name: "BOM", exact: true }).click();
  await expect.element(screen.getByRole("cell", { name: "330 Ω", exact: true })).toBeVisible();
  await screen.getByRole("tab", { name: "PCB", exact: true }).click();
  await screen.getByText("Auto-run", { exact: true }).click();
  const editor = screen.getByRole("textbox", { name: "main.tsx source editor" });
  await editor.fill(circuitTemplates[0].source.replace('resistance="330"', 'resistance="1k"'));
  await expect
    .element(screen.getByRole("status", { name: "Circuit build status" }))
    .toHaveTextContent("Changes pending");
  await screen.getByRole("button", { name: "Export", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: /Gerber fabrication files/ }))
    .toBeDisabled();
  await screen.getByRole("button", { name: "Close dialog" }).click();
  await expect.element(screen.getByText("Draft saved", { exact: true })).toBeVisible();
  await screen.unmount();
  const restoredContainer = document.createElement("div");
  restoredContainer.style.height = "100dvh";
  // Recovery is independent of the agent router and server.
  await using recovered = await render(
    <StrictMode>
      <Studio />
    </StrictMode>,
    { container: restoredContainer, router: false },
  );
  const recoveredEditor = recovered.getByRole("textbox", { name: "main.tsx source editor" });
  await expect.element(recoveredEditor).toBeVisible();
  expect(
    EditorView.findFromDOM(recoveredEditor.element() as HTMLElement)?.state.doc.toString(),
  ).toContain('resistance="1k"');
  await expect
    .element(recovered.getByRole("dialog", { name: "Welcome to TSCI Code" }))
    .not.toBeInTheDocument();
  await expect
    .element(recovered.getByRole("status", { name: "Circuit build status" }))
    .toHaveTextContent("Circuit up to date");
});

it("renders the same compiled board as a schematic and an interactive 3D model", async () => {
  const json = await compileCircuit(
    { "main.tsx": circuitTemplates[0].source },
    "main.tsx",
    new AbortController().signal,
  );
  const container = document.createElement("div");
  container.style.height = "700px";
  container.style.display = "flex";
  // The circuit viewers work independently of the application router.
  await using screen = await render(
    <Preview
      json={json}
      tab="schematic"
      running={false}
      stale={false}
      buildId={1}
      onTabChange={() => {}}
    />,
    { container, router: false },
  );
  await expect
    .element(screen.getByRole("tabpanel"))
    .not.toHaveTextContent("Loading schematic viewer");
  await screen.rerender(
    <Preview
      json={json}
      tab="3d"
      running={false}
      stale={false}
      buildId={1}
      onTabChange={() => {}}
    />,
  );
  await expect.element(screen.getByRole("tabpanel")).not.toHaveTextContent("Loading 3D viewer");
  await expect.element(screen.getByRole("img", { name: "Interactive 3D board" })).toBeVisible();
  await vi.waitFor(() => expect(screen.container.querySelector("canvas")).not.toBeNull());
});
