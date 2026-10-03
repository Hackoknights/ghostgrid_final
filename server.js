'use strict';

// GhostGrid / Chrono Rescue cross-device presence server.
// No database and no passwords: it only keeps short-lived mesh-node telemetry
// in memory and broadcasts it to connected browsers.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const STALE_MS = 15000;
const nodes = new Map();
const clients = new Set();

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 100000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sanitizeNode(x) {
  return {
    id: String(x.id || '').slice(0, 80),
    label: String(x.label || 'SURVIVOR').slice(0, 40),
    role: x.role === 'admin' ? 'admin' : 'user',
    x: Number.isFinite(Number(x.x)) ? Number(x.x) : 380,
    y: Number.isFinite(Number(x.y)) ? Number(x.y) : 200,
    battery: Math.max(0, Math.min(100, Number(x.battery ?? 100))),
    rssi: Math.max(-120, Math.min(-20, Number(x.rssi ?? -55))),
    sos: !!x.sos,
    lastSeen: Date.now()
  };
}

function cleanup() {
  const now = Date.now();
  for (const [id, node] of nodes) {
    if (now - node.lastSeen > STALE_MS) nodes.delete(id);
  }
}

function state() {
  cleanup();
  return [...nodes.values()];
}

function broadcast() {
  const payload = `data: ${JSON.stringify({ type: 'state', nodes: state() })}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (_) {}
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (url.pathname === '/api/state' && req.method === 'GET') {
    return json(res, 200, { nodes: state() });
  }

  if ((url.pathname === '/api/register' || url.pathname === '/api/heartbeat') &&
      req.method === 'POST') {
    try {
      const node = sanitizeNode(await readBody(req));
      if (!node.id) return json(res, 400, { error: 'missing id' });
      nodes.set(node.id, node);
      broadcast();
      return json(res, 200, { ok: true });
    } catch (_) {
      return json(res, 400, { error: 'invalid JSON' });
    }
  }

  if (url.pathname === '/api/unregister' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (body.id) nodes.delete(String(body.id));
      broadcast();
      return json(res, 200, { ok: true });
    } catch (_) {
      return json(res, 400, { error: 'invalid JSON' });
    }
  }

  if (url.pathname === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify({ type: 'state', nodes: state() })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Static app hosting makes the same origin work on multiple devices.
  let file = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  if (file.includes('..')) return json(res, 403, { error: 'forbidden' });

  const target = path.join(ROOT, file);
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { error: 'not found' });

    const ext = path.extname(target).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.css': 'text/css; charset=utf-8',
      '.md': 'text/plain; charset=utf-8'
    };

    // Service workers should be revalidated so new merged builds activate.
    const cacheControl = ext === '.html' || target.endsWith('ghostgrid-sw.js')
      ? 'no-cache'
      : 'public, max-age=3600';

    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': cacheControl
    });
    fs.createReadStream(target).pipe(res);
  });
});

setInterval(() => {
  cleanup();
  broadcast();
}, 5000);

server.listen(PORT, HOST, () => {
  console.log(`GhostGrid server listening on http://${HOST}:${PORT}`);
});
