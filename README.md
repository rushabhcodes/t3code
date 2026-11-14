<p align="center"><img src="assets/tsci/logo.svg" width="84" height="84" alt="TSCI Code" /></p>
<h1 align="center">TSCI Code</h1>
<p align="center">The circuit is the code.</p>

TSCI Code is a local desktop workbench for designing electronics with **TypeScript and tscircuit**. Write a circuit, inspect its schematic and PCB, see the board in 3D, and export the files for your next step. It is built on the MIT-licensed [T3 Code](https://github.com/pingdotgg/t3code) desktop and agent platform.

The circuit editor needs **no account, API key, or installed coding agent**. The inherited agent workspace is available separately when you want help working on a source project.

## Start from source

Use **Node.js 26.12.1** and **pnpm 12.14.0**, matching the versions pinned by this repository. Git and a desktop environment are needed for desktop development.

```sh
git clone https://github.com/rushabhcodes/t3code.git tsci-code
cd tsci-code
npm install -g pnpm@12.14.0
pnpm install
```

Run the circuit editor in your browser:

```sh
pnpm dev:studio
```

Open the local URL printed by Vite. This starts the editor without the optional agent server. Drafts belong to that browser origin; keep the same development port to recover them.

Run the Electron desktop app:

```sh
pnpm dev                 # same as pnpm dev:desktop
```

This builds the compact Electron shell, starts its renderer on a free loopback port, and opens the workbench. The compiler, PCB router, schematic viewer, and 3D board renderer are bundled locally. No Rust toolchain or agent server is needed for this entry point. Electron needs the usual Linux graphical libraries; install its runtime with `pnpm --filter @t3tools/desktop ensure:electron` if the download was skipped.

The development renderer uses a stable app origin, so native draft recovery survives changing development ports. Stopping the launcher also stops its child processes.

There are no published TSCI Code installers bundled with this source checkout. Build your own package using the commands below.

## Your first circuit

1. **Meet the workbench.** The welcome flow explains source, previews, and exports. Choose **Hello, LED**, **Voltage divider**, **RC low-pass filter**, or a blank board, then name the project.
2. **Make a change.** Open `main.tsx`. Try changing the LED circuit's resistance from `330` to `1k`. Auto-run rebuilds after you stop typing; turn it off to build manually.
3. **Inspect the design.** Switch between **PCB**, **Schematic**, **3D**, and **BOM**. Scroll to zoom and drag to pan. Use Code, Split, or Preview layout to give a view more space.
4. **Resolve problems.** Open the Problems panel for compiler and circuit diagnostics. A failed build preserves the last successful preview and marks it as needing a rebuild. Fabrication exports stay disabled until the current source builds without errors.
5. **Keep a portable copy.** Save a `.tsci.json` project. It contains every source file and the entry point. Reopen it on another device, or keep it in version control.
6. **Export.** Download a source project, Circuit JSON, a BOM CSV, schematic SVG, or Gerber ZIP. Inspect the exported board and your manufacturer's rules before ordering.

Replay onboarding from **Guide → Replay the welcome tour**. The guide also explains component coordinates and trace selectors.

## Write circuits with TSX

A circuit entry point exports a component containing a board. Components need unique names; footprints and dimensions use tscircuit's units and conventions.

```tsx
export default () => (
  <board width="30mm" height="20mm" autorouter="auto-local">
    <pinheader name="J1" pinCount={2} footprint="pinrow2" pcbX={-10} schX={-5} />
    <resistor name="R1" resistance="330" footprint="0603" pcbX={-4} schX={-2} />
    <led name="D1" color="green" footprint="0603" pcbX={4} schX={2} />
    <trace from="net.VCC" to=".R1 > .pin1" />
    <trace from=".R1 > .pin2" to=".D1 > .pin1" />
    <trace from=".D1 > .pin2" to="net.GND" />
    <trace from=".J1 > .pin1" to="net.VCC" />
    <trace from=".J1 > .pin2" to="net.GND" />
  </board>
);
```

Use `pcbX`/`pcbY` for board positions and `schX`/`schY` for schematic positions. The component library inserts resistor, capacitor, and LED snippets with unique references. Place inserted components and add their connections before manufacturing.

Create more files with the explorer's **New source file** action. Relative imports resolve inside the project:

```tsx
import { Indicator } from "./components/Indicator";
```

The active file can differ from the entry point. Select **Use as entry point** on another TSX/JSX file to build it instead. The editor supports syntax highlighting, search, undo/redo, bracket matching, tab indentation, and circuit-aware completion. See the [tscircuit documentation](https://docs.tscircuit.com) for the full component API.

## Files, drafts, and recovery

- **Projects:** up to 20 local projects, each with up to 100 source files and a 2 MB portable project limit. Import `.tsci.json`, `.tsx`, or `.jsx` with Open.
- **Local recovery:** changes are saved to IndexedDB after a short pause. “Draft saved” means the device transaction completed; it does not mean a file was written to disk. The editor warns before leaving while a draft is uncommitted or storage has failed.
- **Desktop Save:** native dialogs choose the destination. Later saves update that chosen file with an atomic replacement. Opening a single TSX/JSX file and saving it preserves the source format. Use Save As to create a complete project instead.
- **Browser Save:** downloads a portable project. Browser drafts stay in that browser profile and origin.
- **Recovery failures:** retry without changing the saved workspace, or enter a clearly marked temporary workspace and save files manually. A storage failure never becomes a “saved” status.
- **Backups:** exported files remain on disk when a local draft is removed. Clearing app/browser data removes local drafts. Save project files for backups and moving between devices.

The compiler is bundled locally and runs in a disposable web worker. Editing cancels obsolete builds, and a 30-second ceiling stops stalled code or routing. Built-in starters compile without a hosted rendering service. Automatic supplier lookups are disabled for local editing. Add part numbers explicitly when preparing a BOM. External package imports and custom 3D assets can require internet access. Project source is executable TypeScript; open source from people you trust.

TSCI Code uses its own desktop identity (`com.tsci.code`), protocol (`tsci-code://`), and Chromium profiles (`tsci-code-studio` and `tsci-code-studio-dev` inside your OS app-data directory). It can coexist with T3 Code. Set `TSCI_USER_DATA_DIR` to an isolated directory for testing. Internal `@t3tools/*` package names and `T3CODE_*` variables remain for compatibility with the optional agent platform.

## Export formats

| Format          | Use                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------- |
| `.tsci.json`    | Reopen the full editable project in TSCI Code                                                |
| Source ZIP      | TSX/source files, `tscircuit.config.json`, and a package manifest with `dev`/`build` scripts |
| `.circuit.json` | Compiled tscircuit design for other tools                                                    |
| BOM CSV         | Component references, types, values, and available manufacturer part numbers                 |
| Schematic SVG   | A vector drawing for documentation                                                           |
| Gerber ZIP      | Copper, solder mask, paste, silkscreen, outline, and Excellon drill files                    |

Source/project exports work before a build. Compiled exports require a current result, and Gerbers additionally require no build errors. Circuit checks do not replace electrical review, a manufacturer's DRC, or checking footprints and part availability.

## Keyboard workflow

| Action          | macOS      | Windows / Linux |
| --------------- | ---------- | --------------- |
| Command palette | ⌘ K        | Ctrl K          |
| Save            | ⌘ S        | Ctrl S          |
| Save As         | ⌘ Shift S  | Ctrl Shift S    |
| Open            | ⌘ O        | Ctrl O          |
| Run circuit     | ⌘ Enter    | Ctrl Enter      |
| Autocomplete    | Ctrl Space | Ctrl Space      |

The command palette includes project switching, new/open/save, exports, settings, and the guide. Settings controls dark/light appearance and auto-run.

## Work with an agent

The inherited T3 agent platform remains available as a separate workflow:

```sh
pnpm dev:agents                 # web editor plus local agent server
pnpm dev:desktop:agents         # inherited desktop with agent server
```

In the full web application, choose **Coding agents** in the circuit editor's left rail. Export a source ZIP, extract it into a folder, and add that folder to the agent workspace. Connect an installed, authenticated provider such as Codex or Claude Code, then reopen the updated source in the circuit editor.

Agent work uses your provider account and subscriptions. Circuit drafts and agent folders do not synchronize automatically. The wordmark in the agent workspace returns to the circuit editor. The compact desktop build contains the circuit workflow; it does not start the agent platform. The inherited desktop workflow needs the native build prerequisites in [the development runbook](docs/operations/development.md).

## Build desktop packages

```sh
pnpm build:desktop
```

Package on the corresponding host OS:

```sh
pnpm dist:desktop:linux       # Linux AppImage
pnpm dist:desktop:dmg         # macOS DMG
pnpm dist:desktop:win:x64     # Windows x64 installer
```

Artifacts are written under `release/`. `pnpm start:desktop` opens an existing build. Windows and macOS signing/notarization require your own credentials. This compact editor has no automatic update feed; distribute new installers through your own releases.

Production builds generate third-party notices and fail if a dependency lacks a distributable notice. Compatible viewer releases are pinned, and verified license declarations/notices are recorded in `third-party-licenses.config.json`. Keep this check enabled when updating dependencies.

Regenerate the web and desktop icons from `assets/tsci/logo.svg` with `pnpm icons:export`; verify them with `pnpm icons:check`.

## Development checks

```sh
pnpm --filter @t3tools/web typecheck:studio
pnpm exec vp test run apps/web/src/circuits/project.test.ts
pnpm --filter @t3tools/web exec vp test run --project browser src/circuits/compiler.browser.test.ts
pnpm --filter @t3tools/desktop exec vp test run src/circuits/CircuitFiles.test.ts src/electron/ElectronProtocol.test.ts
pnpm check:changed
```

For an existing Chromium installation in CI, set `TSCI_CHROMIUM_PATH=/path/to/chromium` for browser tests. Otherwise use Playwright's installed Chromium. The worker tests compile every starter and exercise fabrication exports, invalid TSX, and cancellation. Native file tests cover destination grants, cancellation, atomic writes, and binary exports.

## License and credits

[MIT](LICENSE). The original T3 Code copyright and license are retained. TSCI Code is a derivative project, not an official T3 Code release. Circuit compilation and viewers come from the [tscircuit ecosystem](https://github.com/tscircuit); the editor uses CodeMirror. Third-party notices remain in `third-party-licenses/`. The 3D pane uses Three.js to render the board outline, drilled holes, pads, traces, and generic component bodies directly from Circuit JSON. It redraws on camera input, resize, and circuit changes. Detailed supplier CAD models are not included.

The product is named TSCI Code. The GitHub repository is still `rushabhcodes/t3code`; the remote repository slug has not been renamed.
