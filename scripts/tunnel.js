#!/usr/bin/env node
/**
 * Cloudflare Quick Tunnel — no password, no account required, API-friendly
 * Uses `cloudflared tunnel --url http://localhost:<PORT>`
 * The public URL is printed to stdout and works immediately as an API endpoint.
 */
const { spawn } = require('child_process');
const PORT = process.env.PORT || '3000';

// Cho phép chỉ định path cloudflared qua biến môi trường (Windows dễ lỗi PATH)
// Ví dụ: CLOUDFLARED_PATH="C:\\Program Files\\cloudflared\\cloudflared.exe"
const CLOUDFLARED_BIN = process.env.CLOUDFLARED_PATH || 'cloudflared';

console.log(`\n🔄 Starting Cloudflare Quick Tunnel → http://localhost:${PORT} ...\n`);

const cf = spawn(CLOUDFLARED_BIN, ['tunnel', '--url', `http://localhost:${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  // shell=true giúp chạy được file .cmd trên Windows
  shell: process.platform === 'win32',
});

let urlFound = false;

function parseLine(line) {
  const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !urlFound) {
    urlFound = true;
    const url = match[0];
    console.log('');
    console.log('=== Cloudflare Tunnel Active ===');
    console.log('URL  :', url);
    console.log('Feed1:', url + '/feed/eqvol.xml');
    console.log('Feed2:', url + '/feed/extra.xml');
    console.log('Feed3:', url + '/feed/other.xml');
    console.log('================================');
    console.log('No password. Works as API endpoint.');
    console.log('');
  }
}

cf.stdout.on('data', (d) => {
  const lines = d.toString().split('\n');
  lines.forEach(parseLine);
});

cf.stderr.on('data', (d) => {
  const lines = d.toString().split('\n');
  lines.forEach(parseLine);
  // Show non-noise logs only before URL found
  if (!urlFound) {
    const text = d.toString().trim();
    if (text && !text.includes('INF') && !text.includes('Thank you')) {
      process.stdout.write(text + '\n');
    }
  }
});

cf.on('close', (code) => {
  console.log(`\nTunnel closed (exit ${code}).`);
  process.exit(code || 0);
});

process.on('SIGINT', () => { cf.kill('SIGINT'); });
process.on('SIGTERM', () => { cf.kill('SIGTERM'); });
