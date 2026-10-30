// Build de un solo HTML. Dueño: game-architect.
//   node build.js          → horda.html        (minificado, __DEBUG__ = false)
//   node build.js --debug  → horda-debug.html  (sin minificar, __DEBUG__ = true, window.__game)
// Los .glb se embeben como data URL (import url from '../../assets/X.glb').

import * as esbuild from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const debug = process.argv.includes('--debug');
const outName = debug ? 'horda-debug.html' : 'horda.html';
const MARKER = '<!--BUNDLE-->';

const t0 = performance.now();

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: !debug,
  sourcemap: false,
  legalComments: 'none',
  charset: 'utf8',
  loader: { '.glb': 'dataurl', '.gltf': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl' },
  define: { __DEBUG__: debug ? 'true' : 'false' },
  logLevel: 'warning',
  metafile: true,
});

let js = result.outputFiles[0].text;
// Evita que el parser HTML cierre el <script> o entre en "script data escaped state".
// '<\/' y '\x3C' son escapes válidos en strings, plantillas y regex (incluso con flag u).
js = js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '\\x3C!--');

const template = await readFile(path.join(root, 'template.html'), 'utf8');
if (!template.includes(MARKER)) {
  console.error(`template.html no contiene el marcador ${MARKER}`);
  process.exit(1);
}
// Función de reemplazo: así los '$' del bundle no se interpretan como patrones.
const html = template.replace(MARKER, () => `<script>\n${js}\n</script>`);

const outPath = path.join(root, outName);
await writeFile(outPath, html, 'utf8');

const bytes = Buffer.byteLength(html, 'utf8');
const ms = (performance.now() - t0).toFixed(0);
const mb = (bytes / (1024 * 1024)).toFixed(2);

// Desglose por entrada (top 5) para vigilar el peso.
const inputs = Object.entries(result.metafile.outputs)[0][1].inputs;
const top = Object.entries(inputs)
  .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
  .slice(0, 5)
  .map(([f, v]) => `    ${(v.bytesInOutput / 1024).toFixed(0).padStart(6)} KB  ${f}`)
  .join('\n');

console.log(`${outName}: ${mb} MB (${bytes} bytes) en ${ms} ms${debug ? ' [debug]' : ''}`);
console.log(`  mayores entradas:\n${top}`);
