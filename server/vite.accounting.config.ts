import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/accounting/',plugins:[react()],build:{outDir:'dist-accounting',emptyOutDir:true,rollupOptions:{input:'accounting.html'}}});
