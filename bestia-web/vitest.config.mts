import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Il motore gira in Node; i test dell'interfaccia dichiarano "@vitest-environment jsdom".
    environment: "node",
  },
});
