// @effect-diagnostics nodeBuiltinImport:off -- Electron's application entry point owns native process, window, and profile startup.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as Electron from "electron";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";
import * as Schema from "effect/Schema";
import { CircuitSaveInputSchema, type CircuitDesktopCommand } from "@t3tools/contracts";
import * as CircuitFilePicker from "./circuits/CircuitFilePicker.ts";
import * as CircuitFiles from "./circuits/CircuitFiles.ts";
import { OPEN_CIRCUIT_FILE_CHANNEL, SAVE_CIRCUIT_FILE_CHANNEL } from "./ipc/channels.ts";
import * as ElectronProtocol from "./electron/ElectronProtocol.ts";

const { app, BrowserWindow, dialog, shell, ipcMain, Menu, protocol } = Electron;
const development = !app.isPackaged;
const scheme = ElectronProtocol.getDesktopScheme(development);
const origin = `${scheme}://app`;
app.setName("TSCI Code");
const profile =
  NodeProcess.env.TSCI_USER_DATA_DIR ??
  NodePath.join(app.getPath("appData"), development ? "tsci-code-studio-dev" : "tsci-code-studio");
NodeFS.mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
app.setAppUserModelId("com.tsci.code");
protocol.registerSchemesAsPrivileged([
  {
    scheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
let mainWindow: Electron.BrowserWindow | null = null;
const decodeSave = Schema.decodeUnknownSync(CircuitSaveInputSchema);

function assertTrustedSender(event: Electron.IpcMainInvokeEvent) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  )
    throw new Error("Only the circuit workbench can access project files.");
}

async function start() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  await app.whenReady();
  const picker = Layer.succeed(
    CircuitFilePicker.CircuitFilePicker,
    CircuitFilePicker.CircuitFilePicker.of({
      open: Effect.tryPromise({
        try: async () => {
          const options: Electron.OpenDialogOptions = {
            title: "Open a TSCI Code project",
            properties: ["openFile"],
            filters: [{ name: "TSCI project or circuit", extensions: ["json", "tsx", "jsx"] }],
          };
          const result = mainWindow
            ? await dialog.showOpenDialog(mainWindow, options)
            : await dialog.showOpenDialog(options);
          return Option.fromNullishOr(result.canceled ? undefined : result.filePaths[0]);
        },
        catch: (cause) => new CircuitFilePicker.CircuitFilePickerError({ cause }),
      }),
      save: Effect.fn("tsci.nativeFilePicker.save")((name: string) =>
        Effect.tryPromise({
          try: async () => {
            const options: Electron.SaveDialogOptions = {
              title: "Save from TSCI Code",
              defaultPath: name,
              filters: [{ name: "Circuit file", extensions: [NodePath.extname(name).slice(1)] }],
            };
            const result = mainWindow
              ? await dialog.showSaveDialog(mainWindow, options)
              : await dialog.showSaveDialog(options);
            return result.canceled ? Option.none() : Option.fromNullishOr(result.filePath);
          },
          catch: (cause) => new CircuitFilePicker.CircuitFilePickerError({ cause }),
        }),
      ),
    }),
  );
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      CircuitFiles.layer.pipe(Layer.provide(Layer.merge(NodeServices.layer, picker))),
      ElectronProtocol.layer.pipe(Layer.provide(NodeServices.layer)),
    ),
  );
  const scope = await runtime.runPromise(Scope.make());
  const devUrl = NodeProcess.env.VITE_DEV_SERVER_URL;
  await runtime.runPromise(
    Effect.gen(function* () {
      const assetProtocol = yield* ElectronProtocol.ElectronProtocol;
      yield* assetProtocol.registerDesktopProtocol({
        scheme,
        clerkFrontendApiHostname: undefined,
        ...(devUrl
          ? { targetOrigin: new URL(devUrl) }
          : { assetDirectory: NodePath.resolve(__dirname, "../../web/dist-studio") }),
      });
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  );
  const files = await runtime.runPromise(CircuitFiles.CircuitFiles);
  ipcMain.handle(OPEN_CIRCUIT_FILE_CHANNEL, (event) => {
    assertTrustedSender(event);
    return runtime.runPromise(files.open);
  });
  ipcMain.handle(SAVE_CIRCUIT_FILE_CHANNEL, (event, raw: unknown) => {
    assertTrustedSender(event);
    return runtime.runPromise(files.save(decodeSave(raw)));
  });
  app.on("will-quit", () => {
    ipcMain.removeHandler(OPEN_CIRCUIT_FILE_CHANNEL);
    ipcMain.removeHandler(SAVE_CIRCUIT_FILE_CHANNEL);
    void runtime.runPromise(Scope.close(scope, Exit.void)).finally(() => runtime.dispose());
  });

  const command = (value: CircuitDesktopCommand) =>
    mainWindow?.webContents.send("tsci:command", value);
  const createWindow = async () => {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 800,
      minHeight: 600,
      show: false,
      title: "TSCI Code",
      backgroundColor: "#151917",
      icon: NodePath.resolve(__dirname, "../../../assets/prod/black-universal-1024.png"),
      ...(NodeProcess.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const } : {}),
      webPreferences: {
        preload: NodePath.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    const window = mainWindow;
    window.once("ready-to-show", () => window.show());
    window.on("closed", () => {
      if (mainWindow === window) mainWindow = null;
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith(`${origin}/`)) {
        event.preventDefault();
        if (/^https?:\/\//.test(url)) void shell.openExternal(url);
      }
    });
    window.webContents.on("will-prevent-unload", (event) => {
      if (
        dialog.showMessageBoxSync(window, {
          type: "question",
          title: "Draft still saving",
          message: "This draft has not finished saving on this device.",
          detail: "Wait for Draft saved, or save a project file before closing.",
          buttons: ["Keep editing", "Close anyway"],
          defaultId: 0,
          cancelId: 0,
        }) === 1
      )
        event.preventDefault();
    });
    await window.loadURL(`${origin}/studio.html`);
  };
  const fileMenu: Electron.MenuItemConstructorOptions[] = [
    { label: "New Circuit", accelerator: "CmdOrCtrl+N", click: () => command("new") },
    { label: "Open Project…", accelerator: "CmdOrCtrl+O", click: () => command("open") },
    { type: "separator" },
    { label: "Save Project", accelerator: "CmdOrCtrl+S", click: () => command("save") },
    {
      label: "Save Project As…",
      accelerator: "CmdOrCtrl+Shift+S",
      click: () => command("save-as"),
    },
    { type: "separator" },
    { role: "close" },
  ];
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(NodeProcess.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
      { label: "File", submenu: fileMenu },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { label: "Run Circuit", accelerator: "CmdOrCtrl+Enter", click: () => command("run") },
          { type: "separator" },
          { role: "reload" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
          ...(development ? [{ role: "toggleDevTools" as const }] : []),
        ],
      },
      { role: "windowMenu" },
      {
        label: "Help",
        submenu: [
          { label: "Quick Guide", click: () => command("guide") },
          {
            label: "tscircuit Documentation",
            click: () => {
              void shell.openExternal("https://docs.tscircuit.com");
            },
          },
          { role: "about" },
        ],
      },
    ]),
  );
  app.setAboutPanelOptions({
    applicationName: "TSCI Code",
    applicationVersion: app.getVersion(),
    copyright: "Built on T3 Code. Powered by tscircuit.",
  });
  await createWindow();
  app.on("activate", () => {
    if (!mainWindow) void createWindow();
  });
  app.on("window-all-closed", () => {
    if (NodeProcess.platform !== "darwin") app.quit();
  });
}

void start().catch((error: unknown) => {
  dialog.showErrorBox(
    "TSCI Code couldn’t start",
    error instanceof Error ? error.message : String(error),
  );
  app.exit(1);
});
