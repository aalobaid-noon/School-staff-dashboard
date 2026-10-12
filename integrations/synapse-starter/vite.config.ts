import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, 'client'),
  plugins: [react(), tailwindcss()],
  server: {
    // Replit serves the dev preview from a *.replit.dev host; Vite's
    // allowedHosts check blocks it by default ("Blocked request... not allowed").
    // Only affects the dev server (vite middleware); prod serves static files.
    allowedHosts: ['.replit.dev'],
  },
  build: {
    outDir: resolve(here, 'dist/public'),
    emptyOutDir: true,
  },
});
