import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: "./index.html",
        sw: "./src/shell/sw.ts",
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"),
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
