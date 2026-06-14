import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Frontend dev server config.
 *
 * The app talks directly to Supabase (Auth + PostgREST/RPC + Storage) using the
 * SDK, so no dev proxy is needed — calls are CORS-enabled by Supabase. Configure
 * the project with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
