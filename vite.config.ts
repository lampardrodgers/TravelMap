import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'functionlock'],
  server: {
    proxy: {
      '/api': 'http://localhost:5174',
    },
  },
})
