import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the frontend runs on 5173 and the API on 4000. Proxying
// /api keeps the browser talking to a same-origin path, so there are no CORS
// surprises and — importantly — no API base URL or keys baked into the client.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
