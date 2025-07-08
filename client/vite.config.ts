import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@client": path.resolve(__dirname, "./src"),
      "@server": path.resolve(__dirname, "../server/src"),
      "@shared": path.resolve(__dirname, "../shared/src")
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      host: "localhost",
      protocol: "ws",  // use "wss" if using HTTPS
      clientPort: 5173 // ensure client uses same port
    },
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  }
})
