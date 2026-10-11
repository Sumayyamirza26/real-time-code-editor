import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Keep the CRA output dir so the backend static serving keeps working
  build: { outDir: "build", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
      "/socket.io": { target: "http://localhost:5000", ws: true },
    },
  },
  preview: { port: 5173 },
});
