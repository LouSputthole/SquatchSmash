#!/usr/bin/env node
// Bundles the game into a single self-contained HTML file (no server, no
// module imports needed) — handy for sharing or embedding where ES-module
// imports and separate files aren't available.
//
// Usage: node tools/bundle.mjs [outfile]           (default: dist/squatchsmash.html)
//        node tools/bundle.mjs --fragment out.html (omit doctype/html wrapper,
//                                                   for embedding in an existing page)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outFile = args.find((a) => !a.startsWith('--')) || join(root, 'dist', 'squatchsmash.html');

const read = (p) => readFileSync(join(root, p), 'utf8');

// --- three.module.js: turn the single trailing `export{a as B,...};` into a
// namespace object returned from an IIFE.
let three = read('lib/three.module.js');
const exportMatches = three.match(/export\s*\{/g) || [];
if (exportMatches.length !== 1) {
  throw new Error(`expected exactly 1 export statement in three.module.js, found ${exportMatches.length}`);
}
three = three.replace(/export\s*\{([^}]*)\}\s*;?/, (_, clause) => {
  const pairs = clause.split(',').map((entry) => {
    const [local, exported] = entry.trim().split(/\s+as\s+/);
    return exported ? `${exported}:${local}` : `${local}:${local}`;
  });
  return `return {${pairs.join(',')}};`;
});
const threeBundle = `const THREE = (() => {\n${three}\n})();`;

// --- Game modules: strip import/export syntax and wrap each in an IIFE that
// returns its exports, preserving module scoping (helper names collide freely).
function moduleIIFE(path, returns, binding) {
  let src = read(path);
  src = src.replace(/^import\s[^\n]*\n/gm, '');
  src = src.replace(/^export\s+(const|function|class|let)/gm, '$1');
  return `const ${binding} = (() => {\n${src}\nreturn { ${returns.join(', ')} };\n})();`;
}

const parts = [
  threeBundle,
  moduleIIFE('src/audio.js',
    ['init', 'setMuted', 'isMuted', 'smash', 'crack', 'whiff', 'clang', 'step', 'scream', 'chime', 'roar', 'sting'],
    'sfx'),
  moduleIIFE('src/player.js', ['Sasquatch'], '{ Sasquatch }'),
  moduleIIFE('src/debris.js', ['DebrisSystem'], '{ DebrisSystem }'),
  moduleIIFE('src/effects.js', ['Effects'], '{ Effects }'),
  moduleIIFE('src/world.js', ['BOUNDS', 'lambert', 'buildWorld'], '{ BOUNDS, lambert, buildWorld }'),
  moduleIIFE('src/campers.js', ['CamperSystem'], '{ CamperSystem }'),
];

// main.js runs at top level (it *is* the program)
let main = read('src/main.js');
main = main.replace(/^import\s[^\n]*\n/gm, '');
parts.push(`(() => {\n${main}\n})();`);

const script = parts.join('\n\n');
if (/^\s*(import|export)\s/m.test(script)) {
  throw new Error('bundle still contains import/export statements');
}

// --- HTML shell: reuse index.html, dropping the importmap + module script.
let html = read('index.html');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
html = html.replace(/<script type="module"[^>]*><\/script>\s*/, `<script>\n${script}\n</script>\n`);
if (fragment) {
  // Strip the document wrapper: keep everything inside <body>, plus <title>
  // and the <style> block from <head>.
  const title = (html.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const style = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const body = (html.match(/<body>([\s\S]*)<\/body>/) || [null, ''])[1];
  html = `${title}\n${style}\n${body}`;
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`wrote ${outFile} (${(html.length / 1024).toFixed(0)} KB)`);
