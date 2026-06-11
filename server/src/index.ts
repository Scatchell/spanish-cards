import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
pool.on('error', (error) => {
  if (process.env.NODE_ENV === 'test' && 'code' in error && error.code === '57P01') {
    return;
  }

  console.warn('Unexpected idle PostgreSQL client error:', error.message);
});
const app = createApp(config, pool);

// In production the API server also serves the built client.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

if (!config.mcpToken) {
  console.warn('MCP_TOKEN is not set: /mcp is disabled and will return a configuration error (see .env.example)');
}

const server = app.listen(config.port, () => {
  console.log(`spanish-cards API listening on http://localhost:${config.port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${config.port} is already in use — another process (for example the prod app container) owns it. ` +
        'Change PORT in .env or stop the conflicting process.',
    );
    process.exit(1);
  }
  throw error;
});
