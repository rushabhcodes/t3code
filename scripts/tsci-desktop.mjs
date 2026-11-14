import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeProcess from "node:process";
import { ensureElectronRuntime } from "../apps/desktop/scripts/ensure-electron-runtime.mjs";

const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const desktop = NodePath.join(root, "apps/desktop");
const web = NodePath.join(root, "apps/web");
const mode = NodeProcess.argv[2] ?? "dev";
const children = new Set();
let exitCode = 0;
let renderer;
const vp = NodePath.join(
  root,
  "node_modules",
  ".bin",
  NodeProcess.platform === "win32" ? "vp.cmd" : "vp",
);
function launch(command, args, cwd, env = NodeProcess.env) {
  const windowsShell = command === vp && NodeProcess.platform === "win32";
  const child = NodeChildProcess.spawn(windowsShell ? `"${command}"` : command, args, {
    cwd,
    env,
    stdio: "inherit",
    ...(windowsShell ? { shell: true } : {}),
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}
function finished(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`Command stopped (${signal ?? code}).`)),
    );
  });
}
async function cleanup() {
  for (const child of children) child.kill("SIGTERM");
  await renderer?.close();
  renderer = undefined;
}
NodeProcess.default.once("SIGINT", () => {
  void cleanup().finally(() => NodeProcess.exit(0));
});
NodeProcess.default.once("SIGTERM", () => {
  void cleanup().finally(() => NodeProcess.exit(0));
});
async function packShell() {
  await finished(launch(vp, ["pack"], desktop, { ...NodeProcess.env, TSCI_DESKTOP_STUDIO: "1" }));
  const { version } = JSON.parse(
    NodeFS.readFileSync(NodePath.join(desktop, "package.json"), "utf8"),
  );
  NodeFS.writeFileSync(
    NodePath.join(desktop, "dist-studio/package.json"),
    JSON.stringify({
      name: "tsci-code",
      productName: "TSCI Code",
      version,
      main: "main.cjs",
      private: true,
    }),
  );
}
async function build() {
  const { build: buildRenderer } = await import("vite-plus");
  await buildRenderer({ root: web, configFile: NodePath.join(web, "vite.studio.config.ts") });
  await packShell();
}
async function run() {
  if (mode === "build") {
    await build();
    return;
  }
  if (mode === "package") {
    const platform =
      NodeProcess.argv[3] ??
      (NodeProcess.platform === "darwin"
        ? "mac"
        : NodeProcess.platform === "win32"
          ? "win"
          : "linux");
    if (!["linux", "mac", "win"].includes(platform)) throw new Error("Choose linux, mac, or win.");
    const architecture = NodeProcess.argv[4];
    if (architecture && !["x64", "arm64"].includes(architecture))
      throw new Error("Choose x64 or arm64.");
    await build();
    await ensureElectronRuntime();
    const require = NodeModule.createRequire(
      new URL("../apps/desktop/package.json", import.meta.url),
    );
    const hostPlatform =
      NodeProcess.platform === "darwin"
        ? "mac"
        : NodeProcess.platform === "win32"
          ? "win"
          : "linux";
    const nativeDistribution =
      platform === hostPlatform && (!architecture || architecture === NodeProcess.arch)
        ? NodePath.join(NodePath.dirname(require.resolve("electron/package.json")), "dist")
        : null;
    await finished(
      launch(
        NodeProcess.execPath,
        [
          require.resolve("electron-builder/cli.js"),
          "--config",
          "apps/desktop/tsci-builder.yml",
          `--${platform}`,
          ...(architecture ? [`--${architecture}`] : []),
          ...(nativeDistribution ? [`--config.electronDist=${nativeDistribution}`] : []),
          "--publish",
          "never",
        ],
        root,
      ),
    );
    return;
  }
  if (mode !== "dev" && mode !== "start") throw new Error("Choose dev, start, build, or package.");
  let devOrigin;
  if (mode === "dev") {
    await packShell();
    const { createServer } = await import("vite-plus");
    renderer = await createServer({
      root: web,
      configFile: NodePath.join(web, "vite.studio.config.ts"),
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    await renderer.listen();
    devOrigin = renderer.resolvedUrls?.local[0];
    if (!devOrigin) throw new Error("The circuit renderer did not publish its local address.");
    console.log(`TSCI Code renderer: ${devOrigin}`);
  } else if (
    !NodeFS.existsSync(NodePath.join(web, "dist-studio/studio.html")) ||
    !NodeFS.existsSync(NodePath.join(desktop, "dist-studio/main.cjs"))
  ) {
    throw new Error("Build TSCI Code first with pnpm build:desktop.");
  }
  const electronPath = await ensureElectronRuntime();
  const env = { ...NodeProcess.env, ...(devOrigin ? { VITE_DEV_SERVER_URL: devOrigin } : {}) };
  delete env.ELECTRON_RUN_AS_NODE;
  await finished(
    launch(
      electronPath,
      [
        ...NodeProcess.argv.slice(3).filter((argument) => argument !== "--"),
        NodePath.join(desktop, "dist-studio"),
      ],
      desktop,
      env,
    ),
  );
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await cleanup();
}
NodeProcess.exit(exitCode);
