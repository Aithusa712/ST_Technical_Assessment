import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 20000,
    hookTimeout: 30000,
    reporters: ["verbose"],
  },
});
