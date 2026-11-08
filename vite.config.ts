import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        analytics: fileURLToPath(new URL('./src/seo-analytics.ts', import.meta.url)),
      },
      output: { entryFileNames: chunk => chunk.name === 'analytics' ? 'assets/analytics.js' : 'assets/[name]-[hash].js' },
    },
  },
});
