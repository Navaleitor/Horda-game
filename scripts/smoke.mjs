// Prueba de humo (game-architect): abre horda-debug.html en Chromium headless,
// comprueba 0 errores de consola, que window.__game.stats() responde y que Enter
// pasa de 'menu' a 'playing'. Uso: node build.js --debug && node scripts/smoke.mjs
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, process.argv[2] || 'horda-debug.html');
if (!existsSync(file)) {
  console.error(`No existe ${file}. Ejecuta antes: node build.js --debug`);
  process.exit(1);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let ok = true;
const fail = (msg) => { ok = false; console.error('FALLO:', msg); };

try {
  await page.goto(pathToFileURL(file).href);
  if (!file.endsWith('-debug.html')) {
    // Build release: no hay window.__game; solo comprobamos que arranca sin errores.
    await page.waitForFunction(() => document.getElementById('boot').style.display === 'none', null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    throw { release: true };
  }
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 15000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 5000 });
  const tick0 = await page.evaluate(() => window.__game.time.tick);
  await page.waitForTimeout(2000);
  const res = await page.evaluate(() => ({
    stats: window.__game.stats(),
    tick: window.__game.time.tick,
    now: window.__game.time.now,
    session: window.__game.session,
  }));
  console.log('stats:', JSON.stringify(res.stats));
  console.log('session:', JSON.stringify(res.session), 'ticks en 2 s:', res.tick - tick0, 'now:', res.now.toFixed(2));
  if (typeof res.stats.fpsAvg !== 'number' || res.stats.samples === 0) fail('stats() sin muestras');
  if (res.tick - tick0 < 30) fail('el loop de paso fijo apenas avanza');
} catch (e) {
  if (!e || !e.release) fail(e.message);
}

if (errors.length) { fail(`${errors.length} errores de consola`); for (const e of errors) console.error('  ', e); }
await browser.close();
console.log(ok ? 'HUMO OK (0 errores de consola)' : 'HUMO FALLIDO');
process.exit(ok ? 0 : 1);
