import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  server: {
    host: "127.0.0.1",
    // PORT is the PREFERRED port; Vite auto-increments to the next free one if
    // it's taken. Plain `pnpm dev` (no PORT) defaults to 5473 — the client-solid
    // dev port (client-react's is 5173, client-prototype's is 5273).
    port: parseInt(process.env.PORT || "5473", 10),
  },
  build: {
    outDir: "dist",
  },
});
