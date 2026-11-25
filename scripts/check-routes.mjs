#!/usr/bin/env node
import fs from 'node:fs/promises';

const base = (process.argv[2] || 'http://127.0.0.1:4173').replace(/\/$/, '');
const manifestUrl = `${base}/manus-routes.json`;
const manifestResponse = await fetch(manifestUrl);
if (!manifestResponse.ok) throw new Error(`manifest ${manifestResponse.status}: ${manifestUrl}`);
const manifest = await manifestResponse.json();
if (!Array.isArray(manifest.routes)) throw new Error('manifest.routes must be an array');

const checked = [];
for (const route of manifest.routes) {
  const path = route.path.replace(/:([A-Za-z0-9_]+)/g, 'sample');
  const response = await fetch(`${base}${path}`, { redirect: 'manual' });
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`${response.status} ${path}`);
  }
  checked.push({ path: route.path, requestPath: path, status: response.status });
}
console.log(JSON.stringify({ base, manifest: manifestUrl, count: checked.length, checked }, null, 2));
