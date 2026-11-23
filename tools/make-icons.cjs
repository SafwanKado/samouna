// Renders PWA icons from inline SVG with the preinstalled Playwright Chromium.
// Usage: node tools/make-icons.cjs
const { chromium } = require('playwright');
const path = require('path');

function svg({ bg1, bg2, badge, maskable }) {
  const pad = maskable ? 0 : 0; // full-bleed for maskable; rounded otherwise
  const r = maskable ? 0 : 112;
  const scale = maskable ? 0.72 : 0.86; // keep the loaf inside the maskable safe zone
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
    <linearGradient id="crust" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd59a"/><stop offset="1" stop-color="#e79a45"/></linearGradient>
  </defs>
  <rect x="${pad}" y="${pad}" width="${512 - 2 * pad}" height="${512 - 2 * pad}" rx="${r}" fill="url(#bg)"/>
  <g transform="translate(256 262) scale(${scale}) rotate(-28)">
    <path d="M-200 0 C-150 -95 150 -95 200 0 C150 95 -150 95 -200 0 Z" fill="url(#crust)" stroke="#7a3a0c" stroke-width="10"/>
    <path d="M-95 -38 q20 38 0 76 M-15 -48 q22 48 0 96 M65 -38 q20 38 0 76" fill="none" stroke="#a5560f" stroke-width="14" stroke-linecap="round"/>
  </g>
  ${badge ? `<g transform="translate(${maskable ? 340 : 372} ${maskable ? 340 : 372})"><circle r="${maskable ? 52 : 68}" fill="#fff"/><path transform="scale(${maskable ? 0.76 : 1})" d="M-34 18 h68 v14 h-68z M-30 14 c-26 -6 -26 -46 4 -44 c4 -22 48 -22 52 0 c30 -2 30 38 4 44z" fill="#3b2416"/></g>` : ''}
</svg>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  const variants = {
    customer: { bg1: '#e07a2e', bg2: '#b85a17', badge: false },
    bakery: { bg1: '#5a3520', bg2: '#2f1b10', badge: true },
  };
  for (const [app, v] of Object.entries(variants)) {
    const out = path.join(__dirname, '..', 'apps', app, 'public', 'icons');
    for (const [file, size, maskable] of [
      ['icon-512.png', 512, false], ['icon-192.png', 192, false],
      ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true],
    ]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg({ ...v, maskable }).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
      await page.locator('svg').screenshot({ path: path.join(out, file), omitBackground: !maskable });
    }
  }
  await browser.close();
  console.log('icons written');
})();
