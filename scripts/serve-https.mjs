#!/usr/bin/env node
/**
 * LTC Intern Tracking System - HTTPS Reverse Proxy
 * Runs an HTTPS server on port 3443 (or process.env.HTTPS_PORT)
 * and proxies traffic to the local Next.js HTTP server on port 3000.
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certDir = path.resolve(__dirname, '../certificates');
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error('\n❌ SSL certificate not found in "certificates/" folder!');
  console.log('Run: python scripts/generate-cert.py to create one first.\n');
  process.exit(1);
}

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443', 10);
const TARGET_PORT = parseInt(process.env.PORT || '3000', 10);

const proxyServer = https.createServer(httpsOptions, (req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      'x-forwarded-proto': 'https',
      'x-forwarded-host': req.headers.host || 'localhost',
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('502 Bad Gateway: Next.js server is not reachable on port ' + TARGET_PORT);
  });

  req.pipe(proxyReq, { end: true });
});

proxyServer.on('upgrade', (req, socket, head) => {
  const proxySocket = http.request({
    hostname: '127.0.0.1',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  });

  proxySocket.on('upgrade', (proxyRes, upstreamSocket, upstreamHead) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n` +
      Object.keys(proxyRes.headers).map(k => `${k}: ${proxyRes.headers[k]}`).join('\r\n') +
      '\r\n\r\n');
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });

  proxySocket.on('error', () => {
    socket.destroy();
  });

  proxySocket.end();
});

proxyServer.listen(HTTPS_PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log('🔒 LTC Intern System - Secure HTTPS Proxy is Running!');
  console.log('======================================================');
  console.log(`\nLocal URL:       https://localhost:${HTTPS_PORT}`);
  console.log(`Internal/VPN:    https://26.28.161.84:${HTTPS_PORT}`);
  console.log(`Forwarding to:   http://127.0.0.1:${TARGET_PORT}\n`);
  console.log('Tips:');
  console.log('1. On the first visit, click "Advanced" -> "Proceed to site (unsafe)"');
  console.log('2. Once opened over HTTPS, GPS Geolocation works on all devices!');
  console.log('======================================================\n');
});
