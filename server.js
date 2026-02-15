const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

let cursor = 0;
const channelEvents = new Map();

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function appendEvent(channel, event) {
  cursor += 1;
  if (!channelEvents.has(channel)) channelEvents.set(channel, []);
  const events = channelEvents.get(channel);
  events.push({ id: cursor, ...event });
  if (events.length > 250) events.shift();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/sync/push') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || '{}');
      const channel = payload.channel || 'default';
      if (!payload.event || typeof payload.event !== 'object') {
        sendJson(res, 400, { error: 'Missing event payload' });
        return;
      }
      appendEvent(channel, payload.event);
      sendJson(res, 200, { ok: true, cursor });
      return;
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/sync/poll') {
    const channel = url.searchParams.get('channel') || 'default';
    const since = Number(url.searchParams.get('since') || '0');
    const events = (channelEvents.get(channel) || []).filter((event) => event.id > since);
    sendJson(res, 200, { cursor, events });
    return;
  }

  const requestPath = decodeURIComponent(url.pathname || '/');
  const safePath = path.normalize(requestPath).replace(/^\.\.(\/|\\|$)/, '');
  let filePath = path.join(ROOT, safePath === '/' ? 'index.html' : safePath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) filePath = path.join(filePath, 'index.html');
    serveFile(res, filePath);
  });
});

server.listen(PORT, () => {
  console.log(`FreeTeleprompter running at http://0.0.0.0:${PORT}`);
});
