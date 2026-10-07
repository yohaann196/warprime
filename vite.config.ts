import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import pkg from './package.json' with { type: 'json' };

const commit = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VITE_COMMIT_SHA ?? 'dev';
const builtAt = new Date().toISOString();

/** Emits dist/version.json so a running game can detect that a newer build was deployed. */
function versionFile(): Plugin {
  return {
    name: 'warprime-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: pkg.version, commit, builtAt }),
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), versionFile()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(builtAt),
    __COMMIT__: JSON.stringify(commit),
  },
  build: { sourcemap: true, target: 'es2022' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
} as never);
