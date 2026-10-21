// Browser checks for offline play. Run after `npm run build`. Skipped unless
// PLAYWRIGHT_CORE points at a playwright-core install:
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
//   CHROME_PATH=/usr/bin/chromium node --test e2e/offline.e2e.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const APP = '/iron-vale/';
const PW = process.env.PLAYWRIGHT_CORE;
const skip = PW ? false : 'set PLAYWRIGHT_CORE to run the browser checks';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

let server, browser, base;

before(async () => {
  if (skip) return;
  server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (!pathname.startsWith(APP)) return void res.writeHead(404).end();
    const rel = decodeURIComponent(pathname.slice(APP.length));
    let file = normalize(join(DIST, rel));
    if (!file.startsWith(DIST)) return void res.writeHead(403).end();
    if (rel === '' || rel.endsWith('/')) file = join(file, 'index.html');
    let body;
    try {
      body = await readFile(file);
    } catch {
      return void res.writeHead(404).end();
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  });
  await new Promise(ready => server.listen(0, '127.0.0.1', ready));
  base = `http://127.0.0.1:${server.address().port}${APP}`;
  const { chromium } = createRequire(import.meta.url)(PW);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--disable-gpu', '--disable-renderer-backgrounding',
           '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
  });
});

after(async () => {
  await browser?.close();
  server?.close();
});

// The app uses a prompt-style update, so a first visit installs the worker but does
// not control the page until the next load. Wait for the worker, then reload once.
async function openOnline() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 60000 });
  await page.waitForSelector('.start-screen__play');
  return { context, page, errors };
}

test('the start screen opens with the network off, with its artwork', { skip }, async () => {
  const { context, page, errors } = await openOnline();
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.start-screen__play');
  const logoWidth = await page.locator('img.start-screen__banner').evaluate(img => img.naturalWidth);
  assert.ok(logoWidth > 0, 'the logo did not load offline');
  assert.deepEqual(errors, []);
  await context.close();
});

test('every precached file can be fetched with the network off', { skip }, async () => {
  const { context, page, errors } = await openOnline();
  const sw = await readFile(join(DIST, 'sw.js'), 'utf8');
  const urls = [...new Set([...sw.matchAll(/url:"([^"]+)"/g)].map(([, u]) => u))];
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.start-screen__play');
  const statuses = await page.evaluate(async list => Promise.all(list.map(u => fetch(u).then(r => r.status, () => 0))), urls.map(u => `${APP}${u}`));
  const missing = urls.filter((_, i) => statuses[i] !== 200);
  assert.deepEqual(missing, [], 'these precached files were not served offline');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a match starts and draws its map with the network off', { skip }, async () => {
  const { context, page, errors } = await openOnline();
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.start-screen__play');
  await page.click('.start-screen__play');
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(5000);   // the four-second pre-game countdown
  const inked = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let pixels = 0;
    for (let i = 0; i < data.length; i += 4 * 97) if (data[i + 3] > 0) pixels++;
    return pixels;
  });
  assert.ok(inked > 0, 'the map canvas is blank offline');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a saved match is still there after a reload with the network off', { skip }, async () => {
  const { context, page, errors } = await openOnline();
  await page.click('.start-screen__play');
  await page.waitForSelector('canvas', { timeout: 15000 });
  // The game autosaves every 10 seconds of real time while a match is running, so
  // wait for the first save rather than reloading before it has been written.
  await page.waitForFunction(() => localStorage.getItem('iron_vale_save') !== null, null, { timeout: 25000 });
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.start-screen__continue', { timeout: 15000 });
  await page.click('.start-screen__continue');
  await page.waitForSelector('canvas', { timeout: 15000 });
  assert.deepEqual(errors, []);
  await context.close();
});
