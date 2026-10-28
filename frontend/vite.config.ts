import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const phyphoxProxyPlugin = (): Plugin => ({
  name: 'phyphox-proxy-middleware',
  configureServer(server) {
    server.middlewares.use('/phyphox-proxy', async (req, res) => {
      try {
        const parsedUrl = new URL(req.url || '', 'http://localhost');
        const rawUrl = parsedUrl.searchParams.get('base_url') || parsedUrl.searchParams.get('url') || '';
        let ip = parsedUrl.searchParams.get('ip') || '';
        let port = parsedUrl.searchParams.get('port') || '8080';
        const targetPath = parsedUrl.searchParams.get('path') || '/get';

        if (rawUrl) {
          const clean = rawUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
          if (clean.includes(':')) {
            const parts = clean.split(':');
            ip = parts[0];
            port = parts[1] || port;
          } else {
            ip = clean;
          }
        }

        if (!ip) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'No Phyphox phone IP or Base URL configured' }));
          return;
        }

        parsedUrl.searchParams.delete('ip');
        parsedUrl.searchParams.delete('port');
        parsedUrl.searchParams.delete('path');
        parsedUrl.searchParams.delete('base_url');
        parsedUrl.searchParams.delete('url');
        const restQuery = parsedUrl.searchParams.toString();
        
        const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
        const fullTargetUrl = `http://${ip}:${port}${cleanPath}${restQuery ? '?' + restQuery : ''}`;
        
        const response = await fetch(fullTargetUrl, { signal: AbortSignal.timeout(3000) });
        const data = await response.text();
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.statusCode = response.status;
        res.end(data);
      } catch (err: any) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.statusCode = 502;
        res.end(JSON.stringify({ error: err.message || 'Cannot reach phone' }));
      }
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), phyphoxProxyPlugin()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
