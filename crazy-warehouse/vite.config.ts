import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  test: {
    include: process.env.SPEC_TARGETS ? ['tests/targets/**/*.test.ts'] : ['tests/*.test.ts'],
    testTimeout: 120_000,
  },
} as never);
