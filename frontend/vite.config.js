import { defineConfig, loadEnv } from "vite";

export default defineConfig(function configurar({ mode }) {
  const ambiente = loadEnv(mode, process.cwd(), "");
  const apiConfigurada = ambiente.VITE_API_URL || "http://localhost:3000/api";
  const destinoApi = new URL(apiConfigurada).origin;

  return {
    server: {
      proxy: {
        "/api": {
          target: destinoApi,
          changeOrigin: true
        }
      }
    }
  };
});
