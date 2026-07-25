import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/parcels': 'http://localhost:3000',
      '/leads': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/dashboard': 'http://localhost:3000',
      '/events': 'http://localhost:3000',
      '/agents': 'http://localhost:3000',
      '/reports': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});