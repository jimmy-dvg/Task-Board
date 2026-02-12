import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: '/'
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        dashboard: 'dashboard/index.html'
      }
    }
  }
});
