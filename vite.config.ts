import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as never);
