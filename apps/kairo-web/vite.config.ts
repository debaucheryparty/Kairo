import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@platform': path.resolve(__dirname, process.env.TAURI_ENV_PLATFORM ? './src/platform/tauri.ts' : './src/platform/web.ts'),
    },
  },
  server: {
    port: 5173,
  },
});
