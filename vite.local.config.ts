import { defineConfig, mergeConfig } from "vite";
import config from "./vite.config.ts";
export default mergeConfig(
  config,
  defineConfig({
    server: {
      host: "127.0.0.1",
      port: 8099,
      strictPort: true,
      proxy: {
        "/api": "http://127.0.0.1:8098",
        "/static": "http://127.0.0.1:8098",
      },
    },
  }),
);
