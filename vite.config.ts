import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:18088',
      '/hook': 'http://127.0.0.1:18088',
      '/health': 'http://127.0.0.1:18088',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
