import express from 'express';
import compression from 'compression';
import path from 'path';
import dotenv from 'dotenv';
import { SQLiteAdapter } from './src/adapters/storage/SQLiteAdapter';
import { MemoryCacheAdapter } from './src/adapters/cache/MemoryCacheAdapter';
import { createApiRouter } from './src/core/router';
import { runMonitorCycle } from './src/core/monitor';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(compression());
app.use(express.json());

// Initialize SQLite storage and Memory cache adapters
const storage = new SQLiteAdapter(process.env.SQLITE_DB_PATH || './data/app.db');
const cache = new MemoryCacheAdapter();

// Mount core API router (bridging Hono to Express or mounting via standard handlers)
const apiRouter = createApiRouter(storage, cache);

// Express adapter for Hono router
app.all('/api/*', async (req, res) => {
  try {
    const url = `http://localhost${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(', '));
    }

    let bodyData: string | undefined = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      bodyData = JSON.stringify(req.body);
    }

    const request = new Request(url, {
      method: req.method,
      headers,
      body: bodyData,
    });

    const response = await apiRouter.fetch(request);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const text = await response.text();
    res.send(text);
  } catch (err: any) {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Vite frontend middleware in development, static serve in production
if (process.env.NODE_ENV !== 'production') {
  import('vite').then(async ({ createServer }) => {
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`[Docker/Node Dev] Server running on http://0.0.0.0:${PORT}`);
    });
  });
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*all', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Docker/Node Prod] Server running on http://0.0.0.0:${PORT}`);
  });
}

// Background monitoring interval (Docker / Node reuse of core monitor cycle)
const heartbeatInterval = Number(process.env.HEARTBEAT_INTERVAL_SECONDS || 60) * 1000;
setInterval(() => {
  runMonitorCycle(storage, cache).catch((err) => {
    console.error('Background monitor error:', err);
  });
}, heartbeatInterval);
