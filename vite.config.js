import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const url = loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL;
  const proxy = url
    ? {
        "/api/veilboard/dice": {
          target: url,
          changeOrigin: true,
          rewrite: () => "/functions/v1/roll-dice",
          configure(server) {
            server.on("proxyReq", (request) => request.removeHeader("origin"));
          },
        },
      }
    : undefined;
  return {
    build: { target: "es2022", sourcemap: false },
    server: {
      strictPort: true,
      proxy,
    },
    preview: { proxy },
  };
});
