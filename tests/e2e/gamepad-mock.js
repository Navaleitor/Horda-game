// Mando Xbox virtual para las pruebas e2e. Dueño: qa-tester.
//
// Uso (Playwright):  await context.addInitScript({ path: 'tests/e2e/gamepad-mock.js' })
// Se ejecuta antes que cualquier script de la página: sobrescribe navigator.getGamepads()
// con un único mando conectado en el índice 0 y expone window.__pad.
//
// ── Convenciones ────────────────────────────────────────────────────────────
// * Mapeo "standard" de la Gamepad API: 17 botones (0..16) y 4 ejes.
//     A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 View=8 Menu=9 L3=10 R3=11
//     Up=12 Down=13 Left=14 Right=15 (Guide=16, no se usa)
//     Ejes: 0=LS.x 1=LS.y 2=RS.x 3=RS.y
// * Sticks: __pad.stick('LS', x, y) usa la convención FÍSICA: x+ = derecha, y+ = ARRIBA
//   (empujar el stick hacia delante). La Gamepad API usa y NEGATIVO hacia arriba, así que el
//   mock escribe axes[1] = -y (y axes[3] = -y para RS). El juego, a su vez, invierte el eje
//   para que input.axis('move').y sea + = adelante. Valores recortados a [-1, 1].
// * Gatillos: LT/RT son botones 6/7 con value analógico. trigger('RT', v) fija value=v y
//   pressed = v > 0.5 (igual que Chrome con un mando real, umbral ~0.5).
// * Tiempos: todo usa tiempo REAL (setTimeout). El juego muestrea el mando en su paso fijo
//   de 60 Hz (16,7 ms) y además el render puede ir lento con SwiftShader, así que una
//   pulsación debe durar >= 50 ms para garantizar que al menos un paso la ve. Por defecto 80 ms.
// * timestamp: avanza (performance.now()) en cada cambio de estado y en cada llamada a
//   getGamepads(), para que el juego no descarte lecturas por "timestamp sin cambios".
// * getGamepads() devuelve una INSTANTÁNEA nueva en cada llamada (como Chrome), con
//   [pad, null, null, null].
// * Vibración: vibrationActuator.playEffect() se registra en __pad.rumbles (para aserciones).

(() => {
  'use strict';
  if (window.__pad) return;

  const BUTTONS = {
    A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
    View: 8, Menu: 9, L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15, Guide: 16,
  };
  // Alias tolerantes (para escribir pruebas más legibles).
  const ALIAS = {
    Back: 'View', Select: 'View', Start: 'Menu', DUp: 'Up', DDown: 'Down', DLeft: 'Left', DRight: 'Right',
    DpadUp: 'Up', DpadDown: 'Down', DpadLeft: 'Left', DpadRight: 'Right', LS: 'L3', RS: 'R3',
  };
  const NBUTTONS = 17;
  const NAXES = 4;

  const values = new Array(NBUTTONS).fill(0); // 0..1
  const axes = new Array(NAXES).fill(0);      // -1..1 (convención Gamepad API)
  let connected = true;
  let timestamp = performance.now();
  const timers = new Set();
  const rumbles = [];
  const log = [];       // historial de acciones del mock (para depurar pruebas)

  function idx(btn) {
    if (typeof btn === 'number') {
      if (btn >= 0 && btn < NBUTTONS) return btn;
    } else if (typeof btn === 'string') {
      const name = ALIAS[btn] || btn;
      if (name in BUTTONS) return BUTTONS[name];
    }
    throw new Error(`[__pad] botón desconocido: ${btn}`);
  }
  const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
  const touch = () => { timestamp = performance.now(); };
  const rec = (op, ...args) => { log.push([+performance.now().toFixed(1), op, ...args]); if (log.length > 500) log.shift(); };

  function setButton(i, v) { values[i] = Math.max(0, Math.min(1, v)); touch(); }

  function later(ms, fn) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { timers.delete(t); fn && fn(); resolve(); }, Math.max(0, ms));
      timers.add(t);
    });
  }

  const vibrationActuator = {
    type: 'dual-rumble',
    effects: ['dual-rumble'],
    canPlayEffectType: (t) => t === 'dual-rumble',
    playEffect(type, params) { rumbles.push({ type, ...(params || {}), at: performance.now() }); return Promise.resolve('complete'); },
    reset() { return Promise.resolve('complete'); },
  };

  function snapshot() {
    touch();
    const buttons = new Array(NBUTTONS);
    for (let i = 0; i < NBUTTONS; i++) {
      const v = values[i];
      const pressed = (i === 6 || i === 7) ? v > 0.5 : v > 0;
      buttons[i] = { pressed, touched: v > 0, value: v };
    }
    return {
      id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
      index: 0,
      connected,
      mapping: 'standard',
      timestamp,
      axes: axes.slice(),
      buttons,
      vibrationActuator,
      hapticActuators: [],
    };
  }

  const getGamepads = function getGamepads() {
    return [connected ? snapshot() : null, null, null, null];
  };
  try {
    Object.defineProperty(Navigator.prototype, 'getGamepads', { value: getGamepads, configurable: true, writable: true });
  } catch (_) { /* ignorar */ }
  Object.defineProperty(navigator, 'getGamepads', { value: getGamepads, configurable: true, writable: true });

  function dispatch(type) {
    const ev = new Event(type);
    Object.defineProperty(ev, 'gamepad', { value: snapshot() });
    window.dispatchEvent(ev);
  }

  const pad = {
    BUTTONS,
    rumbles,
    log,

    /** Pulsa y suelta. Devuelve Promise que se resuelve al soltar. ms >= 50 recomendado. */
    press(btn, ms = 80) {
      const i = idx(btn);
      rec('press', btn, ms);
      setButton(i, 1);
      return later(ms, () => setButton(i, 0));
    },
    /** Mantiene ms milisegundos (Promise). Sin ms: equivale a down(btn) y se suelta con up(). */
    hold(btn, ms) {
      if (ms == null) { pad.down(btn); return Promise.resolve(); }
      return pad.press(btn, ms);
    },
    down(btn) { rec('down', btn); setButton(idx(btn), 1); },
    up(btn) { rec('up', btn); setButton(idx(btn), 0); },
    release(btn) { pad.up(btn); },
    /** Dos toques rápidos: press(ms) + hueco gapMs + press(ms). */
    async doubleTap(btn, gapMs = 120, ms = 60) {
      rec('doubleTap', btn, gapMs);
      await pad.press(btn, ms);
      await later(gapMs);
      await pad.press(btn, ms);
    },
    /** Stick con convención física: y+ = arriba/adelante. */
    stick(which, x, y) {
      const base = which === 'LS' ? 0 : which === 'RS' ? 2 : -1;
      if (base < 0) throw new Error(`[__pad] stick desconocido: ${which}`);
      rec('stick', which, x, y);
      axes[base] = clamp(x);
      axes[base + 1] = -clamp(y);
      touch();
    },
    /** Mueve un stick durante ms y lo devuelve al centro (Promise). */
    async tilt(which, x, y, ms) {
      pad.stick(which, x, y);
      await later(ms);
      pad.stick(which, 0, 0);
    },
    /** Gatillo analógico 0..1 (pressed = v > 0.5). */
    trigger(which, v) {
      if (which !== 'LT' && which !== 'RT') throw new Error(`[__pad] gatillo desconocido: ${which}`);
      rec('trigger', which, v);
      setButton(BUTTONS[which], Number(v) || 0);
    },
    /** Suelta todo, centra sticks y cancela temporizadores pendientes. */
    reset() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      values.fill(0);
      axes.fill(0);
      touch();
      rec('reset');
    },
    wait(ms) { return later(ms); },
    connect() { connected = true; touch(); dispatch('gamepadconnected'); },
    disconnect() { dispatch('gamepaddisconnected'); connected = false; touch(); },
    /** Estado legible (convención física en sticks). */
    state() {
      const out = { connected, timestamp, buttons: {}, LS: [axes[0], -axes[1]], RS: [axes[2], -axes[3]] };
      for (const [k, i] of Object.entries(BUTTONS)) if (values[i] > 0) out.buttons[k] = values[i];
      return out;
    },
  };

  Object.defineProperty(window, '__pad', { value: pad, configurable: false, writable: false });

  // gamepadconnected: en cuanto haya listeners posibles (tras parsear el documento) y otra vez en load
  // por si el juego registra su listener tarde. Un segundo evento es inocuo para un input bien hecho.
  const fire = () => { if (connected) dispatch('gamepadconnected'); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fire, { once: true });
  else setTimeout(fire, 0);
  window.addEventListener('load', () => setTimeout(fire, 0), { once: true });
})();
