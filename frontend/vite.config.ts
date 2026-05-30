import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, path.resolve(__dirname, '../backend'), '');

  const r2AccountId = env.R2_ACCOUNT_ID;
  console.log('R2 Account ID for Proxy:', r2AccountId); // Debug log

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        // Proxy for Cloudflare R2 to bypass CORS in development
        '/r2-proxy': {
          target: `https://${r2AccountId}.r2.cloudflarestorage.com`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/r2-proxy/, ''),
          secure: false,

          // Disable timeouts for large file uploads
          timeout: 0,      // Client to Proxy timeout
          proxyTimeout: 0, // Proxy to Target timeout

          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Sending Request to the Target:', req.method, req.url);
              // Remove Origin and Referer to look like a backend/script request (bypassing R2 CORS)
              proxyReq.removeHeader('Origin');
              proxyReq.removeHeader('Referer');
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            });
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      // O5 — sépare les gros vendors (recharts/d3, MUI) dans leurs propres
      // chunks pour un meilleur cache navigateur (ils changent rarement). On ne
      // touche pas à react lui-même pour éviter tout souci d'ordre de chargement.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
              return 'vendor-charts';
            }
            if (id.includes('@mui') || id.includes('@emotion')) {
              return 'vendor-mui';
            }
            return undefined;
          },
        },
      },
    },
  };
});
