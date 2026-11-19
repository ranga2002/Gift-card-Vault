// Isolated visual preview; serves only a sample HTML file. No Supabase, secrets, or APIs.
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const port = Number(process.env.PORT || 3000);
const htmlPath = path.join(__dirname, 'index.html');
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {Allow: 'GET, HEAD'}); res.end(); return;
  }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname !== '/' && pathname !== '/index.html' && pathname !== '/health') {
    res.writeHead(404); res.end('Not found'); return;
  }
  if (pathname === '/health') {
    res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'});res.end('OK');return;
  }
  try {
    const body = await fs.readFile(htmlPath);
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch(e) {
    res.writeHead(500, {'Content-Type':'text/plain'}); res.end('Preview unavailable');
  }
});
server.listen(port, '0.0.0.0', () => console.log('Isolated Gift Vault design preview listening on ' + port));
