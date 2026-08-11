// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [react(), visualizer()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdf: ['pdfjs-dist/build/pdf', 'pdfjs-dist/build/pdf.worker'],
          tesseract: ['tesseract.js'],
        },
      },
    },
  },
});
