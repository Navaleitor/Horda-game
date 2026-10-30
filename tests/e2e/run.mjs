#!/usr/bin/env node
// Runner e2e de Horda. Dueño: qa-tester.
//
//   node tests/e2e/run.mjs                 compila (release + --debug) y corre todas las suites
//   node tests/e2e/run.mjs --no-build      usa los HTML ya generados
//   node tests/e2e/run.mjs 10 20           solo suites cuyo nombre de archivo contiene "10" o "20"
//   HORDA_PHASE=fase-1b node tests/e2e/run.mjs   cambia la carpeta de salida docs/qa/<fase>/
//
// Formato de suite (tests/e2e/suites/NN-nombre.mjs):
//   export default {
//     name: 'Controles',
//     waitState: 'menu',             // estado a esperar al abrir (opcional)
//     async setup(ctx) {},           // opcional, antes de los casos
//     cases: [ { name: 'mover con LS', async run(ctx) { … } }, … ],
//   }
//   ctx = { page, logs, pad, lib, report, shot(name) }
//   Cada suite abre una página nueva. Al final de cada suite se añade el caso
//   "consola sin errores": cualquier console.error / pageerror / requestfailed la hace fallar.
//   Un caso puede llamar lib.skip('motivo') → SKIP (no falla; para lo aún no implementado).

import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as lib from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const noBuild = argv.includes('--no-build');
const filters = argv.filter((a) => !a.startsWith('--'));

const report = {
  fase: lib.PHASE,
  fecha: new Date().toISOString(),
  chromiumArgs: lib.CHROMIUM_ARGS,
  renderer: null,
  build: { ok: false, release: null, debug: null, sizes: {} },
  suites: [],
  consola: { errores: [], avisos: [] },
  perf: null,
  resumen: null,
};

function fmtBytes(n) { return n == null ? '—' : n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`; }
function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

async function main() {
  // 1) Build
  if (!noBuild) {
    try {
      process.stdout.write('Build release (node build.js)… ');
      report.build.release = { ms: lib.build({ debug: false }).ms };
      console.log(`OK ${report.build.release.ms} ms`);
      process.stdout.write('Build debug (node build.js --debug)… ');
      report.build.debug = { ms: lib.build({ debug: true }).ms };
      console.log(`OK ${report.build.debug.ms} ms`);
      report.build.ok = true;
    } catch (e) {
      console.log('FALLO');
      console.error(e.message);
      report.build.error = e.message.slice(0, 4000);
      finish(1);
      return;
    }
  } else {
    report.build.ok = 'omitido (--no-build)';
  }
  report.build.sizes = { 'horda.html': lib.fileSize(lib.RELEASE_HTML), 'horda-debug.html': lib.fileSize(lib.DEBUG_HTML) };

  // 2) Suites
  const dir = join(here, 'suites');
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
    .filter((f) => !filters.length || filters.some((p) => f.includes(p)));

  const browser = await lib.launch();
  try {
    for (const file of files) {
      const mod = await import(pathToFileURL(join(dir, file)).href);
      const suite = mod.default;
      const sres = { file, name: suite.name || file, cases: [] };
      report.suites.push(sres);
      console.log(`\n▶ ${file} — ${sres.name}`);

      let page, logs, context;
      try {
        ({ page, logs, context } = await lib.openGame(browser, { waitState: suite.waitState ?? 'menu' }));
        if (!report.renderer) report.renderer = await lib.glInfo(page).catch(() => null);
      } catch (e) {
        sres.cases.push({ name: 'abrir el juego', status: 'FAIL', ms: 0, error: e.message });
        console.log(`  FAIL abrir el juego — ${e.message}`);
        if (logs) collectLogs(file, logs);
        if (context) await context.close();
        continue;
      }
      const ctx = { page, logs, context, lib, report, pad: lib.padOf(page), shot: (n) => lib.screenshot(page, `${file.replace('.mjs', '')}-${n}`) };

      const cases = [...(suite.setup ? [{ name: '(setup)', run: suite.setup }] : []), ...(suite.cases || [])];
      let setupFailed = false;
      for (const c of cases) {
        const t0 = Date.now();
        let status = 'PASS', error = null;
        if (setupFailed) { status = 'SKIP'; error = 'setup falló'; }
        else {
          try {
            await withTimeout(c.run(ctx), c.timeout || suite.caseTimeout || 30000, c.name);
          } catch (e) {
            if (e && e.skip) { status = 'SKIP'; error = e.message; }
            else {
              status = 'FAIL'; error = (e && e.message) || String(e);
              if (c.name === '(setup)') setupFailed = true;
              await ctx.shot(`FAIL-${slug(c.name)}`).catch(() => {});
            }
          }
          // Suelta el mando entre casos para que no se arrastre estado.
          await page.evaluate(() => window.__pad && window.__pad.reset()).catch(() => {});
        }
        const ms = Date.now() - t0;
        sres.cases.push({ name: c.name, status, ms, error });
        console.log(`  ${pad(status, 4)} ${c.name}${error ? ` — ${error}` : ''} (${ms} ms)`);
      }

      // Consola de la suite
      const consoleCase = { name: 'consola sin errores', status: logs.errors.length ? 'FAIL' : 'PASS', ms: 0,
        error: logs.errors.length ? `${logs.errors.length} error(es): ${logs.errors.map((e) => e.text).join(' | ').slice(0, 600)}` : null };
      sres.cases.push(consoleCase);
      console.log(`  ${pad(consoleCase.status, 4)} ${consoleCase.name}${consoleCase.error ? ` — ${consoleCase.error}` : ''}`);
      collectLogs(file, logs);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const all = report.suites.flatMap((s) => s.cases);
  const fail = all.filter((c) => c.status === 'FAIL').length;
  finish(fail || !files.length ? 1 : 0);
}

function collectLogs(file, logs) {
  for (const e of logs.errors) report.consola.errores.push({ suite: file, ...e });
  for (const w of logs.warnings) report.consola.avisos.push({ suite: file, ...w });
}

function slug(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40); }

function withTimeout(p, ms, name) {
  let t;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout del caso (${ms} ms): ${name}`)), ms); }),
  ]);
}

function finish(code) {
  const all = report.suites.flatMap((s) => s.cases);
  const count = (st) => all.filter((c) => c.status === st).length;
  report.resumen = { pass: count('PASS'), fail: count('FAIL'), skip: count('SKIP'), erroresConsola: report.consola.errores.length, avisosConsola: report.consola.avisos.length, ok: code === 0 };

  console.log('\n══════════════════════════ RESULTADOS ══════════════════════════');
  console.log(`${pad('Suite', 22)} ${pad('Caso', 52)} Estado`);
  console.log('─'.repeat(82));
  for (const s of report.suites) for (const c of s.cases) console.log(`${pad(s.file.replace('.mjs', ''), 22)} ${pad(c.name, 52)} ${c.status}`);
  console.log('─'.repeat(82));
  console.log(`PASS ${report.resumen.pass} · FAIL ${report.resumen.fail} · SKIP ${report.resumen.skip}`);
  console.log(`Errores de consola: ${report.consola.errores.length} · avisos: ${report.consola.avisos.length}`);
  for (const e of report.consola.errores.slice(0, 20)) console.log(`  ✗ [${e.suite}] [${e.type}] ${e.text.slice(0, 300)}`);
  if (report.perf) {
    const p = report.perf;
    console.log(`FPS (${p.ms / 1000} s, ${p.escena}): medio ${p.raf.fpsAvg} · p5 ${p.raf.fpsP5} · draw calls ${p.stats?.drawCalls ?? '—'} · triángulos ${p.stats?.triangles ?? '—'}`);
  } else console.log('FPS: no medido (sin suite de rendimiento).');
  console.log(`Tamaño: horda.html ${fmtBytes(report.build.sizes['horda.html'])} · horda-debug.html ${fmtBytes(report.build.sizes['horda-debug.html'])}`);
  console.log(`Renderer: ${report.renderer || '—'}`);

  mkdirSync(lib.OUT_DIR, { recursive: true });
  const out = join(lib.OUT_DIR, 'resultados.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`Reporte: ${out.slice(lib.ROOT.length + 1)}`);
  console.log(code === 0 ? 'SUITE VERDE' : 'SUITE ROJA');
  process.exitCode = code;
}

main().catch((e) => { console.error(e); report.fatal = String(e && e.stack || e); finish(1); });
