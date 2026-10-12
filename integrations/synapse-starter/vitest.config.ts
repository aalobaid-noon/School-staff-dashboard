import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The React plugin transforms client .tsx the same way the app build does, so component
  // tests run against real JSX. Server tests default to the node environment; the one
  // component test opts into jsdom via a `@vitest-environment jsdom` docblock.
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'client/**/*.test.tsx', 'scripts/**/*.test.ts'],
  },
});
