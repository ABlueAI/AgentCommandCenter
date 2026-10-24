'use strict';
// S21: renders each candidate icon in app/assets/icon-variants/*.svg to a Windows ICO (PNG frames
// at 16, 24, 32, 48, 64, 128 and 256 px, the same layout as app/assets/mako.ico) and draws the
// side-by-side preview sheet docs/assets/s21-logo-variants.png, with the current icon's own frames
// as the first row.
//
// Dev-only tool, not part of the app or `npm test`. It needs Playwright with Chromium, which is not
// a Mako dependency: run it where Playwright is installed (the cloud session that made the files),
// or `npm i --no-save playwright` and `npx playwright install chromium` in a scratch folder first.
// Run from the repo root: node scripts/logo/render-icon-variants.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const VARIANT_DIR = path.join(ROOT, 'app', 'assets', 'icon-variants');
const CURRENT_ICO = path.join(ROOT, 'app', 'assets', 'mako.ico');
const SHEET = path.join(ROOT, 'docs', 'assets', 's21-logo-variants.png');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const SHEET_SIZES = [16, 20, 24, 32, 40, 48];

function readIcoFrames(buf) {
  const frames = new Map();
  for (let i = 0; i < buf.readUInt16LE(4); i++) {
    const pos = 6 + i * 16;
    const size = buf[pos] || 256;
    frames.set(size, buf.subarray(buf.readUInt32LE(pos + 12), buf.readUInt32LE(pos + 12) + buf.readUInt32LE(pos + 8)));
  }
  return frames;
}

function buildIco(pngs) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, png }, i) => {
    const pos = 6 + i * 16;
    header[pos] = size === 256 ? 0 : size;
    header[pos + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, pos + 4);
    header.writeUInt16LE(32, pos + 6);
    header.writeUInt32LE(png.length, pos + 8);
    header.writeUInt32LE(offset, pos + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs.map(p => p.png)]);
}

async function renderPng(page, svg, size) {
  await page.setViewportSize({ width: size, height: size });
  const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  await page.setContent(`<html><body style="margin:0;background:transparent">` +
    `<img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

function sheetRow(label, frames) {
  const uri = png => 'data:image/png;base64,' + png.toString('base64');
  const cells = bg => SHEET_SIZES.map(s => {
    // Sizes without their own frame (20, 40) are drawn from the next larger frame, as Windows does.
    const frame = frames.get(s) || frames.get(ICO_SIZES.find(f => f > s));
    return `<td style="background:${bg}"><img src="${uri(frame)}" width="${s}" height="${s}"></td>`;
  }).join('');
  const zoom = `<td style="background:#202020"><img src="${uri(frames.get(16))}" width="64" height="64" style="image-rendering:pixelated"></td>`;
  return `<tr><th>${label}</th>${cells('#202020')}${cells('#f3f3f3')}${zoom}</tr>`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const rows = [sheetRow('Current (shark)', readIcoFrames(fs.readFileSync(CURRENT_ICO)))];
  const files = fs.readdirSync(VARIANT_DIR).filter(f => f.endsWith('.svg')).sort();
  for (const file of files) {
    const svg = fs.readFileSync(path.join(VARIANT_DIR, file), 'utf8');
    const pngs = [];
    for (const size of ICO_SIZES) pngs.push({ size, png: await renderPng(page, svg, size) });
    fs.writeFileSync(path.join(VARIANT_DIR, file.replace(/\.svg$/, '.ico')), buildIco(pngs));
    const letter = file.match(/^m-([a-z])-/)[1].toUpperCase();
    rows.push(sheetRow(`${letter}: ${file.replace(/^m-[a-z]-|\.svg$/g, '').replace(/-/g, ' ')}`,
      new Map(pngs.map(p => [p.size, p.png]))));
    process.stdout.write(`wrote ${file.replace(/\.svg$/, '.ico')}\n`);
  }
  const head = SHEET_SIZES.map(s => `<th>${s}</th>`).join('');
  await page.setViewportSize({ width: 1200, height: 200 });
  await page.setContent(`<html><body style="margin:0;padding:12px;background:#fff;font:13px Segoe UI,Arial,sans-serif">
    <table style="border-collapse:collapse" cellpadding="8">
    <tr><th></th><th colspan="${SHEET_SIZES.length}">Dark taskbar (px)</th><th colspan="${SHEET_SIZES.length}">Light taskbar (px)</th><th>16 px, 4x</th></tr>
    <tr><th></th>${head}${head}<th></th></tr>${rows.join('')}</table></body></html>`);
  await page.waitForFunction(() => [...document.images].every(i => i.complete));
  const table = await page.$('table');
  fs.writeFileSync(SHEET, await table.screenshot());
  process.stdout.write(`wrote ${path.relative(ROOT, SHEET)}\n`);
  await browser.close();
}

main().catch(err => { process.stderr.write(`${err.stack || err}\n`); process.exit(1); });
