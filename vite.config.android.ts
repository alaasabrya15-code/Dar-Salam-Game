import { resolve } from "node:path";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";

const projectRoot = process.cwd();

export default defineConfig({
  root: resolve(projectRoot, "native"),
  base: "/",
  publicDir: resolve(projectRoot, "public"),
  resolve: { alias: { "@": resolve(projectRoot, "src") } },
  plugins: [grokPwaPlugin(), tailwindcss(), viteReact()],
  build: {
    outDir: resolve(projectRoot, "capacitor-build/www"),
    emptyOutDir: true,
  },
});
