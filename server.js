import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Health endpoint is intentionally independent from frontend assets.
app.get('/health', (_req, res) => res.json({ ok: true, service: 'kamisah-node', time: new Date().toISOString() }));

const functionNames = [
  'chat', 'film-analyze', 'film-voice', 'generate', 'ideas',
  'pay-webhook', 'seedance', 'topup', 'video', 'voice'
];
const handlers = new Map();
for (const name of functionNames) {
  const moduleUrl = pathToFileURL(path.join(__dirname, 'netlify', 'functions', `${name}.mjs`));
  const mod = await import(moduleUrl.href);
  const handler = mod.default || mod.handler;
  if (typeof handler !== 'function') throw new Error(`Handler tidak ditemukan untuk ${name}`);
  handlers.set(name, handler);
}

// Keep request bodies as raw bytes here. Some legacy handlers need the original
// multipart body; modern handlers consume a Web Request and parse JSON themselves.
app.all('/.netlify/functions/:name', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  const name = req.params.name;
  const handler = handlers.get(name);
  if (!handler) return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const headersObj = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v ?? '')]));
  try {
    // Legacy Netlify handler for video multipart upload expects base64 bytes.
    if (name === 'film-analyze') {
      const event = {
        httpMethod: req.method,
        headers: headersObj,
        body: raw.toString('base64'),
        isBase64Encoded: true,
        path: req.path,
        queryStringParameters: Object.keys(req.query).length ? req.query : null
      };
      const out = await handler(event, {});
      res.status(out.statusCode || 200);
      for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
      return res.send(out.isBase64Encoded ? Buffer.from(out.body || '', 'base64') : (out.body || ''));
    }
    // Legacy film-voice handler expects a JSON string, not base64.
    if (name === 'film-voice') {
      const event = {
        httpMethod: req.method,
        headers: headersObj,
        body: raw.toString('utf8'),
        isBase64Encoded: false,
        path: req.path,
        queryStringParameters: Object.keys(req.query).length ? req.query : null
      };
      const out = await handler(event, {});
      res.status(out.statusCode || 200);
      for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
      return res.send(out.body || '');
    }

    const init = { method: req.method, headers: new Headers(headersObj) };
    if (!['GET', 'HEAD'].includes(req.method) && raw.length) init.body = raw;
    if (init.body) init.duplex = 'half';
    const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const result = await handler(new Request(requestUrl, init));
    if (!(result instanceof Response)) return res.status(500).json({ error: 'Respons backend tidak valid.' });
    res.status(result.status);
    result.headers.forEach((value, key) => res.setHeader(key, value));
    return res.send(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error(`Kamisah endpoint ${name} error:`, error?.stack || error);
    return res.status(500).json({ error: 'Terjadi kesalahan pada backend Kamisah.' });
  }
});

// Do not expose source/configuration files, backend modules, or dependency metadata.
app.use((req, res, next) => {
  const p = decodeURIComponent(req.path);
  if (/(^|\/)(\.env[^/]*|\.git|node_modules)(\/|$)/i.test(p) ||
      /^\/(server\.js|package(?:-lock)?\.json|\.npmrc|\.gitignore|netlify\.toml|check\.js)$/i.test(p) ||
      /\.mjs$/i.test(p) ||
      ['/netlify', '/supabase', '/src'].some(prefix => p === prefix || p.startsWith(prefix + '/'))) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(__dirname, { index: 'index.html', dotfiles: 'deny', extensions: ['html'] }));
app.use((req, res) => res.status(404).send('Halaman tidak ditemukan.'));

app.listen(PORT, HOST, () => console.log(`Kamisah Node server aktif di ${HOST}:${PORT}`));
