// Minimale statische webserver zonder afhankelijkheden: `npm start`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const pad = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const bestand = normalize(join(root, pad === '/' ? 'index.html' : pad));
  if (!bestand.startsWith(root.endsWith(sep) ? root : root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const inhoud = await readFile(bestand);
    res.writeHead(200, { 'Content-Type': types[extname(bestand)] || 'application/octet-stream' });
    res.end(inhoud);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Niet gevonden');
  }
}).listen(port, () => console.log(`Inspectie-app draait op http://localhost:${port}`));
