import * as NodeFSP from "node:fs/promises";
import * as NodeURL from "node:url";
import sharp from "sharp";
import { BRAND_ASSET_PATHS } from "./lib/brand-assets.ts";
import { encodePngIco, WINDOWS_ICON_SIZES } from "./lib/icon-export.ts";

const root = new URL("../", import.meta.url);
const source = await NodeFSP.readFile(new URL("assets/tsci/logo.svg", root));
const check = process.argv.includes("--check");
const pngs = new Map();
async function png(size) {
  if (!pngs.has(size)) pngs.set(size, await sharp(source).resize(size, size).png().toBuffer());
  return pngs.get(size);
}
async function output(path, contents) {
  const target = new URL(path, root);
  if (check) {
    if (!(await NodeFSP.readFile(target)).equals(contents))
      throw new Error(`Icon is out of date: ${NodeURL.fileURLToPath(target)}`);
  } else await NodeFSP.writeFile(target, contents);
}
const ico = encodePngIco(
  await Promise.all(WINDOWS_ICON_SIZES.map(async (size) => ({ size, contents: await png(size) }))),
);
for (const [key, path] of Object.entries(BRAND_ASSET_PATHS)) {
  if (path.endsWith(".ico")) await output(path, ico);
  else if (path.endsWith(".png"))
    await output(
      path,
      await png(
        key.includes("Favicon16")
          ? 16
          : key.includes("Favicon32")
            ? 32
            : key.includes("AppleTouch")
              ? 180
              : key.includes("192")
                ? 192
                : key.includes("512")
                  ? 512
                  : 1024,
      ),
    );
}
for (const [path, size] of [
  ["apple-touch-icon.png", 180],
  ["favicon-16x16.png", 16],
  ["favicon-32x32.png", 32],
  ["icon-192x192.png", 192],
  ["icon-512x512.png", 512],
])
  await output(`apps/web/public/${path}`, await png(size));
await output("apps/web/public/favicon.ico", ico);
await output("apps/web/public/tsci-logo.svg", source);
await output("assets/prod/logo.svg", source);
console.log(check ? "TSCI Code icons are current." : "Exported TSCI Code desktop and web icons.");
