import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(`v${packageJson.version}`),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:18088',
      '/hook': 'http://127.0.0.1:18088',
      '/media': 'http://127.0.0.1:18088',
      '/health': 'http://127.0.0.1:18088',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
