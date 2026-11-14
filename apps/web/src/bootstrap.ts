import { showBootError } from "./lib/bootError";

// Shared dev chunks need the React refresh preamble first. Catch failures before React mounts.
const entryPath = window.desktopBridge
  ? window.location.hash.replace(/^#/, "").split("?")[0]
  : window.location.pathname;
const app =
  entryPath === "/" || entryPath === "" || entryPath === "/circuits"
    ? import("./circuits/main")
    : import("./main");
void app.then(({ startup }) => startup).catch(showBootError);
