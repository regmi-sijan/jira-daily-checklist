import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: `${root}/src/frontend`,
  build: {
    outDir: `${root}/static/main/build`,
    emptyOutDir: true,
  },
});
