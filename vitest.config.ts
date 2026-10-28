import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The real package throws when imported outside React Server Components.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Database tests run against a fresh in-memory PGlite (see src/test/db.ts), never a folder on disk.
    env: { PGLITE_DIR: "memory://", AI4B_SILENCE_DEV_KEY_WARNING: "1" },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
