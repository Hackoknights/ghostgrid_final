'use strict';

// GhostGrid / Chrono Rescue cross-device presence server.
// No database and no passwords: it only keeps short-lived mesh-node telemetry
// in memory and broadcasts it to connected browsers over Server-Sent Events.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const STALE_MS = 15000;
const MAX_NODES = 200;
const MAX_CLIENTS = 500;
// CORS is on by default so a page opened from file:// or another host can still
// join the mesh (it just needs the server address). Set CORS=0 for same-origin only.
const CORS = process.env.CORS !== '0';
const nodes = new Map();   // id -> node (includes private `token`, never broadcast)
const clients = new Set(); // open SSE responses

// Only these files are served statically (server.js and anything else in the
// folder stay private).
const STATIC_ALLOW = /^\/(index\.html|ghostgrid-sw\.js|ghostgrid-manifest\.json|README-CROSS-DEVICE\.md|favicon\.ico|icon-[a-z0-9-]+\.png)$/;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

function cors(h) { if (CORS) h['Access-Control-Allow-Origin'] = '*'; return h; }

function json(res, status, body) {
  res.writeHead(status, cors({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }));
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let done = false;
    req.on('data', c => {
      if (done) return;
      data += c;
      if (data.length > 100000) {
        done = true;
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', e => { if (!done) { done = true; reject(e); } });
  });
}

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function sanitizeNode(x) {
  x = x && typeof x === 'object' ? x : {};
  return {
    id: String(x.id || '').replace(/[^\w-]/g, '').slice(0, 64),
    token: String(x.token || '').slice(0, 128),
    // Labels are rendered by other people's browsers: drop control chars and
    // the characters that matter for HTML injection.
    label: String(x.label || 'SURVIVOR').replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim().slice(0, 40) || 'SURVIVOR',
    role: x.role === 'admin' ? 'admin' : 'user',
    x: clamp(num(x.x, 380), 0, 760),
    y: clamp(num(x.y, 200), 0, 400),
    battery: clamp(Math.round(num(x.battery, 100)), 0, 100),
    rssi: clamp(Math.round(num(x.rssi, -55)), -120, -20),
    sos: x.sos === true,
    lastSeen: Date.now()
  };
}

function publicNode(n) {
  const { token, ...rest } = n; // eslint-disable-line no-unused-vars
  return rest;
}

function cleanup() {
  const now = Date.now();
  for (const [id, node] of nodes) {
    if (now - node.lastSeen > STALE_MS) nodes.delete(id);
  }
}

function state() {
  cleanup();
  return [...nodes.values()].map(publicNode);
}

function signature(n) {
  return [n.label, n.role, n.x, n.y, n.battery, n.rssi, n.sos].join('|');
}

function broadcast() {
  const payload = `data: ${JSON.stringify({ type: 'state', nodes: state() })}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (_) { clients.delete(res); }
  }
}

function isJsonPost(req) {
  // Requiring application/json forces a CORS preflight for cross-origin pages
  // (approved only when CORS is enabled) and blocks plain form-post tricks.
  return String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors({ 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' }));
    return res.end();
  }

  if (url.pathname === '/api/state' && req.method === 'GET') {
    return json(res, 200, { nodes: state() });
  }

  if ((url.pathname === '/api/register' || url.pathname === '/api/heartbeat') && req.method === 'POST') {
    if (!isJsonPost(req)) return json(res, 415, { error: 'application/json required' });
    try {
      const node = sanitizeNode(await readBody(req));
      if (!node.id) return json(res, 400, { error: 'missing id' });
      if (node.token.length < 8) return json(res, 400, { error: 'missing token' });

      const existing = nodes.get(node.id);
      if (existing && existing.token !== node.token) return json(res, 403, { error: 'id in use' });
      if (!existing) {
        cleanup();
        if (nodes.size >= MAX_NODES) return json(res, 503, { error: 'mesh full' });
      }

      nodes.set(node.id, node);
      // Skip the broadcast for a pure keep-alive; the 5 s ticker covers it.
      if (!existing || signature(existing) !== signature(node)) broadcast();
      return json(res, 200, { ok: true });
    } catch (_) {
      return json(res, 400, { error: 'invalid JSON' });
    }
  }

  if (url.pathname === '/api/unregister' && req.method === 'POST') {
    if (!isJsonPost(req)) return json(res, 415, { error: 'application/json required' });
    try {
      const body = await readBody(req);
      const id = String(body.id || '');
      const existing = nodes.get(id);
      if (existing && existing.token === String(body.token || '')) {
        nodes.delete(id);
        broadcast();
      }
      return json(res, 200, { ok: true });
    } catch (_) {
      return json(res, 400, { error: 'invalid JSON' });
    }
  }

  if (url.pathname === '/events' && req.method === 'GET') {
    if (clients.size >= MAX_CLIENTS) return json(res, 503, { error: 'too many listeners' });
    res.writeHead(200, cors({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }));
    res.write(`retry: 3000\ndata: ${JSON.stringify({ type: 'state', nodes: state() })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'method not allowed' });
  }

  // Static app hosting keeps everything on one origin for every device.
  let pathname;
  try { pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
  catch (_) { return json(res, 400, { error: 'bad path' }); }
  if (!STATIC_ALLOW.test(pathname)) return json(res, 404, { error: 'not found' });

  const target = path.join(ROOT, pathname);
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { error: 'not found' });

    const ext = path.extname(target).toLowerCase();
    // Shell, service worker and manifest are always revalidated so new builds activate.
    const revalidate = ext === '.html' || target.endsWith('ghostgrid-sw.js') || target.endsWith('ghostgrid-manifest.json');
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  });
});

setInterval(() => {
  cleanup();
  broadcast();
}, 5000);

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${PORT}/`);
    }
  }
  return out;
}

server.listen(PORT, HOST, () => {
  console.log('GhostGrid server running');
  console.log(`  This device : http://localhost:${PORT}/`);
  const lan = HOST === '127.0.0.1' || HOST === 'localhost' ? [] : lanUrls();
  lan.forEach(u => console.log(`  Other devices: ${u}`));
  if (!lan.length) console.log('  (no LAN address found or HOST restricts to this machine)');
});

function shutdown() {
  for (const res of clients) { try { res.end(); } catch (_) {} }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
