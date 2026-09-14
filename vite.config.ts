import { defineConfig } from "vite";
export default defineConfig({
  server: {
    watch: { ignored: ['**/.venv/**', '**/.local/**', '**/backend/**', '**/design/**'] },
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/admin": "http://127.0.0.1:8000",
      "/static": "http://127.0.0.1:8000",
    },
  },
});
