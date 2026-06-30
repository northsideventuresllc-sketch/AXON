import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conversationsHandler, messagesHandler } from '../lib/dashboard-api.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'dashboard', 'public');
const PORT = Number(process.env.PORT || 3847);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

function adaptHandler(handler, ...args) {
  return (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    req.query = Object.fromEntries(url.searchParams);
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    return handler(req, res, ...args);
  };
}

async function serveStatic(pathname, res) {
  const safe = pathname === '/' ? '/index.html' : pathname;
  const filePath = join(PUBLIC, safe.replace(/^\//, ''));
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname === '/api/conversations') {
    return adaptHandler(conversationsHandler)(req, res);
  }

  const msgMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (msgMatch) {
    return adaptHandler(messagesHandler, msgMatch[1])(req, res);
  }

  if (pathname === '/axon' || pathname.startsWith('/axon/')) {
    const sub = pathname.replace(/^\/axon\/?/, '/') || '/';
    return serveStatic(sub, res);
  }

  return serveStatic(pathname, res);
});

server.listen(PORT, () => {
  console.log(`AXON dashboard → http://localhost:${PORT}`);
  console.log(`Also at http://localhost:${PORT}/axon`);
});
