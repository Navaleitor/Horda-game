// Servicio 'input' (docs/arquitectura.md §3.7). Dueño: controls-camera-engineer.
//
//   input.down(a) / pressed(a) / released(a)   flancos por paso fijo (pressed incluye autorepetición en uiUp/Down/Left/Right)
//   input.heldTime(a) (s) · input.doubleTap(a) (segunda pulsación dentro de config.input.doubleTapWindow)
//   input.axis('move'|'look') → {x,y} con deadzone radial; y+ = adelante/arriba. Objeto reutilizado.
//   input.device → 'gamepad' | 'keyboard' · input.rumble(strong, weak, ms)
// Extras (no rompen el contrato):
//   input.value(a) → 0..1 (gatillos analógicos) · input.lastHeld(a) → s de la última pulsación completa
//   input.consumeMouseLook() → {x,y} píxeles de ratón acumulados (lo consume la cámara por frame)
//   input.connected, input.padId, input.preset
//
// Polling único de navigator.getGamepads() por paso fijo; sistema alwaysRun (registrado el 1.º, así que
// todos los sistemas ven los flancos del mismo paso).

import { createGamepadReader, radialDeadzone } from './gamepad.js';
import { createKeyboardReader } from './keyboard.js';
import { createActionTable } from './actions.js';
import { E_DAY_DEFAULT, ANALOG_BUTTONS, UI_REPEAT, actionNames } from './presets.js';

export default function create() {
  let game = null;
  let cfg = null;
  let preset = E_DAY_DEFAULT;
  const pad = createGamepadReader();
  const kb = createKeyboardReader();
  let actions = null;
  const repeatSet = new Set(UI_REPEAT);
  const analog = new Set(ANALOG_BUTTONS);

  const moveAxis = { x: 0, y: 0 };
  const lookAxis = { x: 0, y: 0 };
  const zeroAxis = { x: 0, y: 0 };
  const rawMove = { x: 0, y: 0 };
  let device = 'keyboard';
  let offState = null;

  function padDown(idx) {
    const v = pad.state.buttons[idx];
    return analog.has(idx) ? v > cfg.triggerThreshold : v > 0.5;
  }

  function sample(name) {
    const p = preset.pad[name];
    if (p) for (let i = 0; i < p.length; i++) if (padDown(p[i])) return true;
    const st = preset.uiStick[name];
    if (st) {
      const v = st.axis === 'x' ? rawMove.x : rawMove.y;
      if (v * st.sign > cfg.menuStickThreshold) return true;
    }
    if (kb.anyKey(preset.keys[name])) return true;
    if (kb.anyMouse(preset.mouse[name])) return true;
    return false;
  }

  function computeAxes() {
    const s = pad.state;
    const ax = preset.axes;
    radialDeadzone(s.axes[ax.move.x], s.axes[ax.move.y], cfg.stickDeadzone, moveAxis);
    radialDeadzone(s.axes[ax.look.x], s.axes[ax.look.y], cfg.lookDeadzone ?? cfg.stickDeadzone, lookAxis);
    rawMove.x = moveAxis.x; rawMove.y = moveAxis.y;
    // Teclado: WASD normalizado; gana la fuente de mayor magnitud.
    const k = preset.keyAxes.move;
    const kx = (kb.anyKey(k.right) ? 1 : 0) - (kb.anyKey(k.left) ? 1 : 0);
    const ky = (kb.anyKey(k.up) ? 1 : 0) - (kb.anyKey(k.down) ? 1 : 0);
    if (kx || ky) {
      const m = Math.hypot(kx, ky);
      if (m >= Math.hypot(moveAxis.x, moveAxis.y)) { moveAxis.x = kx / m; moveAxis.y = ky / m; }
    }
  }

  const api = {
    get device() { return device; },
    get connected() { return pad.state.connected; },
    get padId() { return pad.state.id; },
    get preset() { return preset.id; },
    down(a) { return actions.get(a).down; },
    pressed(a) { const s = actions.get(a); return s.pressed || s.repeat; },
    released(a) { return actions.get(a).released; },
    heldTime(a) { return actions.get(a).held; },
    lastHeld(a) { return actions.get(a).lastHeld; },
    doubleTap(a) { return actions.get(a).doubleTap; },
    value(a) {
      const p = preset.pad[a];
      let v = 0;
      if (p) for (let i = 0; i < p.length; i++) v = Math.max(v, pad.state.buttons[p[i]]);
      if (kb.anyKey(preset.keys[a]) || kb.anyMouse(preset.mouse[a])) v = 1;
      return v;
    },
    axis(name) {
      if (name === 'move') return moveAxis;
      if (name === 'look') return lookAxis;
      zeroAxis.x = 0; zeroAxis.y = 0;
      return zeroAxis;
    },
    consumeMouseLook() { return kb.consumeLook(); },
    rumble(strong, weak, ms) {
      if (device !== 'gamepad') return false;
      return pad.rumble(strong, weak, ms);
    },
  };

  return {
    name: 'input',
    alwaysRun: true,
    init(g) {
      game = g;
      cfg = g.config.input;
      actions = createActionTable(actionNames(preset), cfg);
      const canvas = g.renderer && g.renderer.domElement;
      kb.attach(canvas, () => game.state === 'playing');
      offState = g.events.on('game:state', ({ state }) => {
        if (state !== 'playing') kb.releasePointer();
      });
      g.provide('input', api);
      if (g.debug.enabled) {
        g.debug.register('inputState', () => {
          const out = { device, connected: pad.state.connected, move: { ...moveAxis }, look: { ...lookAxis }, down: [] };
          for (const [n, a] of actions.table) if (a.down) out.down.push(n);
          return out;
        });
      }
    },
    fixedUpdate(dt) {
      const wasConnected = pad.state.connected;
      pad.poll(cfg.stickDeadzone);
      if (kb.hadActivity) device = 'keyboard';
      if (pad.state.activity || (pad.state.connected && !wasConnected)) device = 'gamepad';
      computeAxes();
      actions.step(dt, sample, repeatSet);
      kb.endStep();
    },
    update(dt, alpha) {},
    dispose() {
      if (offState) offState();
      kb.dispose();
      pad.dispose();
    },
  };
}
