import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcssVite from '@tailwindcss/vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // Carica variabili dal file .env nella root del progetto
  const rootDir = path.resolve(__dirname, '..');
  const env = loadEnv(mode, rootDir, '');

  const frontendPort = parseInt(env.FRONTEND_PORT || '5173', 10);
  const backendPort = parseInt(env.BACKEND_PORT || env.PORT || '3001', 10);

  return {
    envDir: rootDir,
    plugins: [react(), tailwindcssVite()],
    server: {
      host: true,
      port: frontendPort,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
