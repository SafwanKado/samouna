// Builds a single self-contained preview page with both PWAs running against
// an in-browser simulated backend.  Usage: npm run demo  ->  demo/dist/samouna-preview.html
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const tmp = path.join(here, '.build');

async function bundle(app) {
  const outDir = path.join(tmp, app);
  await build({
    root: path.join(root, 'apps', app),
    configFile: path.join(root, 'apps', app, 'vite.config.js'),
    logLevel: 'warn',
    build: {
      outDir, emptyOutDir: true, cssCodeSplit: false, modulePreload: false,
      assetsInlineLimit: 100_000_000, copyPublicDir: false,
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const files = await readdir(path.join(outDir, 'assets'));
  const js = await readFile(path.join(outDir, 'assets', files.find((f) => f.endsWith('.js'))), 'utf8');
  const css = await readFile(path.join(outDir, 'assets', files.find((f) => f.endsWith('.css'))), 'utf8');
  const icon = (await readFile(path.join(root, 'apps', app, 'public/icons/icon-192.png'))).toString('base64');
  return { js, css, icon: `data:image/png;base64,${icon}` };
}

function frameDoc({ js, css, icon }, shim) {
  const safeJs = js.replaceAll('/icons/icon-192.png', icon).replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html lang="ku-Arab" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div id="root"></div>
<script>${shim}</script><script type="module">${safeJs}</script></body></html>`;
}

// JSON with "<" escaped, so it can sit safely inside a <script> tag.
const embed = (s) => JSON.stringify(s).replace(/</g, '\\u003c');

const [customer, bakery] = [await bundle('customer'), await bundle('bakery')];
const shim = await readFile(path.join(here, 'frame-shim.js'), 'utf8');
const mock = await readFile(path.join(here, 'mock-server.js'), 'utf8');
const shell = await readFile(path.join(here, 'shell.html'), 'utf8');

const page = shell
  .replace('/*MOCK*/', () => mock)
  .replace('"__CUSTOMER__"', () => embed(frameDoc(customer, shim)))
  .replace('"__BAKERY__"', () => embed(frameDoc(bakery, shim)));

await mkdir(path.join(here, 'dist'), { recursive: true });
await writeFile(path.join(here, 'dist', 'samouna-preview.html'), page);
await rm(tmp, { recursive: true, force: true });
console.log(`demo/dist/samouna-preview.html (${Math.round(page.length / 1024)} KB)`);
