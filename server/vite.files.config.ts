import { defineConfig } from 'vite';import react from '@vitejs/plugin-react';
export default defineConfig({base:'/files/',plugins:[react()],build:{outDir:'dist-files',emptyOutDir:true,rollupOptions:{input:'files.html'}}});
