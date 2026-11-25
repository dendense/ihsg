import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// GitHub Pages serves the dashboard from /ihsg/ (repo dendense/ihsg).
export default defineConfig({
  base: process.env.IHSG_BASE ?? "/ihsg/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
})
