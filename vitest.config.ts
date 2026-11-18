import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

export default defineConfig({
  // Compiles runes in `.svelte.ts` modules (AppState) for the browser runtime.
  plugins: [svelte()],
  resolve: {
    alias: { $lib: path.resolve(import.meta.dirname, "src/lib") },
    conditions: ["browser"],
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
