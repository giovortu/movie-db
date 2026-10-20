import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@vitejs/plugin-react';
import tailwindcssVite from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcssVite()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
