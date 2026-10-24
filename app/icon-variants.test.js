'use strict';
// Run: node app/icon-variants.test.js
//
// S21 candidate icons (docs/LOGO-VARIANTS.md). Each variant is a small static SVG plus an ICO built
// from it with the same seven PNG frames as app/assets/mako.ico. Candidates are artwork only: the
// app loads none of them (the window icon stays app/assets/mako.ico, pinned in mako-branding.test.js).

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  x FAIL: ${label}\n`); failed++; }
}

const dir = path.join(__dirname, 'assets', 'icon-variants');
const files = fs.readdirSync(dir).sort();
const svgs = files.filter(f => f.endsWith('.svg'));
const expected = ['m-a-white-on-black', 'm-b-white-on-navy', 'm-c-white-on-blue', 'm-d-slanted-on-black'];
assert(JSON.stringify(svgs) === JSON.stringify(expected.map(n => `${n}.svg`)),
  'the four candidates A to D are present, by name');
assert(files.every(f => /^m-[a-d]-[a-z-]+\.(?:svg|ico)$/.test(f)) && files.length === expected.length * 2,
  'the folder holds only each candidate\'s SVG and ICO');

const allowedTags = new Set(['svg', 'title', 'rect', 'path']);
const iconSizes = [16, 24, 32, 48, 64, 128, 256];
for (const name of expected) {
  const svg = fs.readFileSync(path.join(dir, `${name}.svg`), 'utf8');
  const body = svg.replace(/<!--[\s\S]*?-->/g, '');
  const tags = [...body.matchAll(/<\/?([\w:-]+)/g)].map(match => match[1]);
  assert(tags.every(tag => allowedTags.has(tag)), `${name}: only static vector elements`);
  assert(!/\b(?:href|src|style|on\w+)\s*=|<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(body),
    `${name}: no external content, event handlers, stylesheet, or entity expansion`);
  assert(!/<(?:text|image|script|foreignObject)\b|@font-face|data:/i.test(body),
    `${name}: no embedded raster, font dependency, or executable content`);
  assert(svg.length < 2000 && /<title>Mako M, variant [A-D]<\/title>/.test(svg) &&
    svg.includes('viewBox="0 0 16 16"'), `${name}: small, named artwork on the 16-unit grid`);

  const ico = fs.readFileSync(path.join(dir, `${name}.ico`));
  assert(ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === iconSizes.length,
    `${name}.ico: ICO header with seven resolutions, like mako.ico`);
  let end = 6 + iconSizes.length * 16;
  let framesOk = true;
  for (let i = 0; i < iconSizes.length; i++) {
    const pos = 6 + i * 16;
    const size = iconSizes[i];
    const bytes = ico.readUInt32LE(pos + 8);
    const start = ico.readUInt32LE(pos + 12);
    const png = ico.subarray(start, start + bytes);
    framesOk = framesOk && (ico[pos] || 256) === size && (ico[pos + 1] || 256) === size &&
      ico.readUInt16LE(pos + 4) === 1 && ico.readUInt16LE(pos + 6) === 32 &&
      start === end && png.length === bytes && png.length > 32 &&
      png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      png.readUInt32BE(16) === size && png.readUInt32BE(20) === size;
    end = start + bytes;
  }
  assert(framesOk && end === ico.length,
    `${name}.ico: contiguous 32-bit PNG frames at 16 to 256 px, no trailing payload`);
}

const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
assert(!main.includes('icon-variants'), 'the app loads no candidate; the window icon stays mako.ico');

const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'LOGO-VARIANTS.md'), 'utf8');
const sheet = fs.readFileSync(path.join(__dirname, '..', 'docs', 'assets', 's21-logo-variants.png'));
assert(doc.includes('](assets/s21-logo-variants.png)') &&
  sheet.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'docs/LOGO-VARIANTS.md shows the committed preview sheet');

process.stdout.write(`\nicon-variants: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
