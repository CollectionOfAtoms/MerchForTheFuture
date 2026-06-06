import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const dbUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    env: {
      DATABASE_URL: dbUrl,
    },
    // Per-file environment overrides:
    //   - Integration tests (DB) → node (no DOM, no MSW)
    //   - Component tests → jsdom + MSW (via setup file)
    // @ts-ignore — supported at runtime; removed from vitest 4 type defs
    environmentMatchGlobs: [
      ["__tests__/epic-*/US-*.test.ts", "node"],
      ["__tests__/components/**/*.test.tsx", "jsdom"],
    ],
    fileParallelism: false,
    setupFiles: ["__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.d.ts", "src/app/layout.tsx", "src/app/page.tsx"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
