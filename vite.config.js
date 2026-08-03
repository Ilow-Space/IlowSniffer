import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import manifest from './manifest.json';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    plugins: [
        tailwindcss(),
        vue(),
        crx({ manifest }),
    ],
    css: {
        devSourcemap: false,
    },
    build: {
        // 1. Max JS shrinking via Terser
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true,
                drop_debugger: true,
                passes: 2,
            },
            mangle: {
                toplevel: true,
            },
            format: {
                comments: false,
            },
        },

        // 2. Max CSS shrinking via LightningCSS
        cssMinify: 'lightningcss',

        // 3. Disable sourcemaps to keep output clean and lightweight
        sourcemap: false,

        rollupOptions: {
            input: {
                offscreen: fileURLToPath(new URL('./offscreen.html', import.meta.url)),
            },
        },
    },
});