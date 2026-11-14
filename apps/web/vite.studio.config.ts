import { defineConfig, mergeConfig } from "vite-plus";
import baseConfig from "./vite.config.ts";

export default defineConfig(async (environment) => {
  const base = typeof baseConfig === "function" ? await baseConfig(environment) : await baseConfig;
  base.server = { ...base.server, warmup: { clientFiles: ["./src/circuits/main.tsx"] } };
  return mergeConfig(base, {
    define: { "import.meta.env.VITE_TSCI_STANDALONE": JSON.stringify("true") },
    optimizeDeps: { entries: ["studio.html"] },
    build: {
      outDir: "dist-studio",
      watch: null,
      sourcemap: false,
      rolldownOptions: { input: "studio.html" },
    },
  });
});
