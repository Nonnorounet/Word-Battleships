import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html: works offline, in Capacitor, in Electron and embedded in Google Sites.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000 },
  test: { environment: 'node' },
} as never);
