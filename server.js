#!/usr/bin/env node
'use strict';
/**
 * 本地预览服务（非部署必需）：托管 docs/ 静态页，并额外提供实时 /api/news。
 * 用法: node server.js [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { loadAll } = require('./lib/aggregate');

const PORT = Number(process.argv[2] || process.env.PORT || 8790);
const DOCS = path.join(__dirname, 'docs');
const CACHE_TTL_MS = 60 * 1000;
let cache = { at: 0, data: null };

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function getNews(force) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await loadAll();
  cache = { at: Date.now(), data };
  return data;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname === '/api/news') {
    try {
      const data = await getNews(u.searchParams.get('refresh') === '1');
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': MIME['.json'] });
      return res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  }
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(DOCS, rel);
  if (!file.startsWith(DOCS)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`本地预览:   http://localhost:${PORT}`);
  console.log(`实时接口:   http://localhost:${PORT}/api/news`);
});
