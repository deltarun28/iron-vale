// Offline checks that need no browser. Run after `npm run build`.
// Every image and sound the source asks for must be in the service worker's
// precache list, or the game breaks the first time it is opened offline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(path);
  }
  return out;
}

// Every asset name passed to asset("...") in the game source.
async function assetsReferencedBySource() {
  const names = new Set();
  for (const file of await sourceFiles(join(ROOT, 'src'))) {
    for (const [, name] of (await readFile(file, 'utf8')).matchAll(/asset\(\s*["']([^"']+)["']\s*\)/g)) names.add(name);
  }
  return names;
}

async function precacheUrls() {
  const sw = await readFile(join(DIST, 'sw.js'), 'utf8');
  return new Set([...sw.matchAll(/url:"([^"]+)"/g)].map(([, url]) => url));
}

test('the build exists', { skip: !existsSync(join(DIST, 'sw.js')) && 'run npm run build first' }, () => {
  assert.ok(existsSync(join(DIST, 'index.html')));
});

test('every asset the game loads is in the precache', { skip: !existsSync(join(DIST, 'sw.js')) && 'run npm run build first' }, async () => {
  const precache = await precacheUrls();
  for (const name of await assetsReferencedBySource()) {
    assert.ok(precache.has(name), `${name} is used by the game but is not precached`);
  }
});

test('the largest precached file is within the size limit', { skip: !existsSync(join(DIST, 'sw.js')) && 'run npm run build first' }, async () => {
  const { statSync } = await import('node:fs');
  const limit = 8 * 1024 * 1024;
  for (const url of await precacheUrls()) {
    const size = statSync(join(DIST, url)).size;
    assert.ok(size <= limit, `${url} is ${size} bytes, over the ${limit} byte precache limit`);
  }
});
