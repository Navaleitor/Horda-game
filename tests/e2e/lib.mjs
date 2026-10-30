// Utilidades de la suite e2e. Dueño: qa-tester.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');
export const PHASE = process.env.HORDA_PHASE || 'fase-1a';
export const OUT_DIR = join(ROOT, 'docs', 'qa', PHASE);
export const MOCK_PATH = join(here, 'gamepad-mock.js');
export const DEBUG_HTML = join(ROOT, 'horda-debug.html');
export const RELEASE_HTML = join(ROOT, 'horda.html');

// WebGL por software (SwiftShader vía ANGLE). Probado en Chromium de Playwright 1.63:
// las tres variantes funcionan; se dejan explícitas para evitar el aviso de
// "Automatic fallback to software WebGL has been deprecated".
export const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required',
];

export const VIEWPORT = { width: 1280, height: 720 };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ejecuta node build.js [--debug]. Lanza si falla. Devuelve { ms, stdout, stderr }. */
export function build({ debug = true } = {}) {
  const args = ['build.js'];
  if (debug) args.push('--debug');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  const ms = Date.now() - t0;
  if (r.status !== 0) {
    const err = new Error(`build falló (código ${r.status})\n${r.stdout}\n${r.stderr}`);
    err.stdout = r.stdout; err.stderr = r.stderr;
    throw err;
  }
  return { ms, stdout: r.stdout, stderr: r.stderr };
}

export function fileSize(path) {
  return existsSync(path) ? statSync(path).size : null;
}

export async function launch() {
  return chromium.launch({ headless: true, args: CHROMIUM_ARGS });
}

/**
 * Abre el HTML en una página nueva con el mando simulado inyectado.
 * Devuelve { page, context, logs } donde logs = { errors[], warnings[], all[] }.
 * Cada `pageerror`, `console.error` o petición fallida cuenta como error.
 */
export async function openGame(browser, { html = DEBUG_HTML, waitState = 'menu', timeout = 30000 } = {}) {
  if (!existsSync(html)) throw new Error(`no existe ${html} (¿se ejecutó node build.js --debug?)`);
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript({ path: MOCK_PATH });
  const page = await context.newPage();
  const logs = { errors: [], warnings: [], all: [] };
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    const loc = msg.location();
    const entry = { type, text, where: loc && loc.url ? `${loc.url.split('/').pop()}:${loc.lineNumber}` : '' };
    logs.all.push(entry);
    if (type === 'error') logs.errors.push(entry);
    else if (type === 'warning') logs.warnings.push(entry);
  });
  page.on('pageerror', (err) => logs.errors.push({ type: 'pageerror', text: String(err && err.stack || err) }));
  page.on('requestfailed', (req) => logs.errors.push({ type: 'requestfailed', text: `${req.url().slice(0, 120)} ${req.failure()?.errorText}` }));
  page.on('crash', () => logs.errors.push({ type: 'crash', text: 'la página se colgó (crash)' }));

  await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout });
  if (waitState) {
    await waitFor(page, (s) => window.__game && window.__game.state === s, { arg: waitState, timeout, what: `estado '${waitState}'` });
  }
  return { page, context, logs };
}

/**
 * Espera a que pred (función evaluada en la página) devuelva truthy. Devuelve su valor.
 * opts: { arg, timeout=5000, interval=50, what }
 */
export async function waitFor(page, pred, { arg, timeout = 5000, interval = 50, what } = {}) {
  try {
    const h = await page.waitForFunction(pred, arg, { timeout, polling: interval });
    return await h.jsonValue();
  } catch (e) {
    const state = await page.evaluate(() => window.__game ? window.__game.state : '(sin __game)').catch(() => '?');
    throw new Error(`timeout ${timeout} ms esperando ${what || pred.toString().slice(0, 120)} (state=${state})`);
  }
}

/** Evalúa en la página (atajo). */
export const ev = (page, fn, arg) => page.evaluate(fn, arg);

/** Captura PNG en docs/qa/<fase>/<name>.png. Devuelve la ruta relativa al repo. */
export async function screenshot(page, name) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  return file.slice(ROOT.length + 1);
}

/**
 * Mide FPS durante ms (5 s por defecto) con requestAnimationFrame en la página
 * (independiente de la ventana del juego) y lee __game.stats() al final
 * (draw calls/triángulos del último frame y FPS de la ventana del juego).
 */
export async function measureFps(page, ms = 5000) {
  const raf = await page.evaluate((dur) => new Promise((resolve) => {
    const dts = [];
    let last = -1;
    const t0 = performance.now();
    function f(t) {
      if (last >= 0) dts.push(t - last);
      last = t;
      if (t - t0 < dur) requestAnimationFrame(f);
      else {
        const sorted = dts.slice().sort((a, b) => a - b);
        const avg = dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length);
        const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
        resolve({ frames: dts.length, fpsAvg: avg ? +(1000 / avg).toFixed(1) : 0, fpsP5: p95 ? +(1000 / p95).toFixed(1) : 0 });
      }
    }
    requestAnimationFrame(f);
  }), ms);
  const stats = await page.evaluate(() => (window.__game && typeof window.__game.stats === 'function') ? window.__game.stats() : null);
  return { ms, raf, stats };
}

/** Pequeño conjunto de aserciones con mensajes en español. */
export const assert = {
  ok(v, msg) { if (!v) throw new Error(msg || 'se esperaba verdadero'); },
  eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'valores distintos'}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); },
  oneOf(a, list, msg) { if (!list.includes(a)) throw new Error(`${msg || 'valor inesperado'}: esperado uno de ${JSON.stringify(list)}, obtenido ${JSON.stringify(a)}`); },
  gt(a, b, msg) { if (!(a > b)) throw new Error(`${msg || 'no es mayor'}: ${a} <= ${b}`); },
  lt(a, b, msg) { if (!(a < b)) throw new Error(`${msg || 'no es menor'}: ${a} >= ${b}`); },
  near(a, b, eps, msg) { if (Math.abs(a - b) > eps) throw new Error(`${msg || 'fuera de tolerancia'}: |${a} - ${b}| > ${eps}`); },
  noErrors(logs, msg) {
    if (logs.errors.length) throw new Error(`${msg || 'errores de consola'} (${logs.errors.length}): ${logs.errors.map((e) => `[${e.type}] ${e.text}`).join(' | ').slice(0, 800)}`);
  },
};

/** Marca un caso como pendiente (no falla la suite; aparece como SKIP en la tabla). */
export class Skip extends Error {
  constructor(msg) { super(msg); this.skip = true; }
}
export const skip = (msg) => { throw new Skip(msg); };

/**
 * Proxy de window.__pad desde Node: pad.press('A'), await pad.doubleTap('A'), pad.stick('LS', 0, 1)…
 * Los métodos que devuelven Promise en la página se esperan aquí.
 */
export function padOf(page) {
  return new Proxy({}, {
    get(_, method) {
      return (...args) => page.evaluate(([m, a]) => window.__pad[m](...a), [method, args]);
    },
  });
}

/** Info del renderer WebGL de la página (para el reporte). */
export async function glInfo(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return null;
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
}
