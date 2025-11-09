const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const baseDir = path.resolve(process.cwd());
const publicFiles = new Set(['index.html']);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(data);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = mime[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.writeHead(200, { 'Content-Type': type });
    stream.pipe(res);
  });
  stream.on('error', (err) => {
    if (err.code === 'ENOENT') return send(res, 404, JSON.stringify({ error: 'Not found' }), { 'Content-Type': 'application/json' });
    console.error(err);
    send(res, 500, JSON.stringify({ error: 'Server error' }), { 'Content-Type': 'application/json' });
  });
}

function safeJoin(root, p) {
  const full = path.normalize(path.join(root, p));
  if (!full.startsWith(root)) return null;
  return full;
}

// Cache docs in memory for simple search
let docs = [];
function loadDocs() {
  try {
    const fp = path.join(baseDir, 'data', 'docs.json');
    const raw = fs.readFileSync(fp, 'utf-8');
    docs = JSON.parse(raw);
  } catch (e) {
    docs = [];
  }
}
loadDocs();

function searchDocs(q) {
  if (!q) return [];
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = docs.map((d) => {
    const hay = `${d.title}\n${d.body}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += 1;
    }
    return { d, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ d }) => ({ id: d.id, title: d.title, path: d.path, snippet: d.body.slice(0, 140) + (d.body.length > 140 ? '…' : '') }));
  return scored;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const { pathname, query } = parsed;

  // API routes
  if (pathname === '/api/health') {
    return send(res, 200, { status: 'ok' });
  }
  if (pathname === '/api/search') {
    return send(res, 200, { results: searchDocs((query.q || '').toString()) });
  }
  if (pathname === '/api/feedback' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const item = { ...body, time: new Date().toISOString(), ip: req.socket.remoteAddress };
      const dir = path.join(baseDir, 'data');
      const fp = path.join(dir, 'feedback.json');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let list = [];
      if (fs.existsSync(fp)) list = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      list.push(item);
      fs.writeFileSync(fp, JSON.stringify(list, null, 2));
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 400, { error: 'Invalid JSON' });
    }
  }

  // Static files
  let filePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  // prevent directory traversal
  const safe = safeJoin(baseDir, filePath);
  if (!safe) return send(res, 400, { error: 'Bad path' });

  // If requesting a directory, serve index.html
  if (fs.existsSync(safe) && fs.statSync(safe).isDirectory()) {
    const idx = path.join(safe, 'index.html');
    if (fs.existsSync(idx)) return serveFile(res, idx);
  }

  // Only allow files within project, and specifically index or assets or data (read-only)
  if (
    safe.startsWith(path.join(baseDir, 'assets')) ||
    safe.startsWith(path.join(baseDir, 'data')) ||
    publicFiles.has(path.basename(safe))
  ) {
    if (fs.existsSync(safe) && fs.statSync(safe).isFile()) return serveFile(res, safe);
  }
  return send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

