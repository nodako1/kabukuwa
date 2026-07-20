import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/kabukuwa/",
  plugins: [react()],
  test: {
    environment: "node",
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
