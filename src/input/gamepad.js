// Lectura del mando (Gamepad API). Dueño: controls-camera-engineer.
// - Un único polling de navigator.getGamepads() por paso fijo (lo llama input/index.js).
// - Deadzone RADIAL con reescalado (sin deriva y sin "salto" al salir de la zona muerta).
// - Rumble con vibrationActuator si existe (dual-rumble).
// Sin allocaciones por paso: estado en arrays tipados reutilizados.

const NBUTTONS = 17;
const NAXES = 4;

export function createGamepadReader() {
  const state = {
    connected: false,
    id: '',
    index: -1,
    buttons: new Float32Array(NBUTTONS),   // valor 0..1
    axes: new Float32Array(NAXES),         // convención de la API (y negativo arriba)
    activity: false,                        // hubo actividad por encima de umbrales en este poll
  };
  let pad = null;          // última instantánea (para vibrationActuator)
  let preferredIndex = -1;

  function onConnected(e) {
    if (e && e.gamepad && preferredIndex < 0) preferredIndex = e.gamepad.index;
  }
  function onDisconnected(e) {
    if (e && e.gamepad && e.gamepad.index === preferredIndex) preferredIndex = -1;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('gamepadconnected', onConnected);
    window.addEventListener('gamepaddisconnected', onDisconnected);
  }

  function pick(list) {
    if (!list) return null;
    if (preferredIndex >= 0 && list[preferredIndex] && list[preferredIndex].connected) return list[preferredIndex];
    // Preferimos un mando con mapping standard; si no, el primero conectado.
    let any = null;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') return p;
      if (!any) any = p;
    }
    return any;
  }

  /** Lee el mando. activityThreshold: umbral de ejes para marcar actividad (deadzone). */
  function poll(activityThreshold) {
    let list = null;
    try {
      list = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : null;
    } catch (_) { list = null; }
    pad = pick(list);
    state.activity = false;
    if (!pad) {
      state.connected = false;
      state.buttons.fill(0);
      state.axes.fill(0);
      return state;
    }
    state.connected = true;
    state.id = pad.id;
    state.index = pad.index;
    const b = pad.buttons;
    for (let i = 0; i < NBUTTONS; i++) {
      const btn = b[i];
      const v = btn ? (typeof btn === 'object' ? (btn.value || (btn.pressed ? 1 : 0)) : +btn) : 0;
      state.buttons[i] = v;
      if (v > 0.5) state.activity = true;
    }
    const a = pad.axes;
    for (let i = 0; i < NAXES; i++) {
      const v = a && i < a.length ? +a[i] || 0 : 0;
      state.axes[i] = v;
      if (v > activityThreshold || v < -activityThreshold) state.activity = true;
    }
    return state;
  }

  /** Rumble: strong/weak 0..1, ms duración. Silencioso si no hay soporte. */
  function rumble(strong, weak, ms) {
    const act = pad && pad.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return false;
    try {
      const p = act.playEffect('dual-rumble', {
        startDelay: 0,
        duration: Math.max(0, ms | 0),
        strongMagnitude: Math.min(1, Math.max(0, strong || 0)),
        weakMagnitude: Math.min(1, Math.max(0, weak || 0)),
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return true;
    } catch (_) { return false; }
  }

  function dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('gamepadconnected', onConnected);
      window.removeEventListener('gamepaddisconnected', onDisconnected);
    }
  }

  return { state, poll, rumble, dispose };
}

/**
 * Deadzone radial con reescalado: |v| < dz → 0; si no, magnitud (|v|−dz)/(1−dz) acotada a 1.
 * Escribe en out {x, y}. ySign = −1 para pasar de la convención de la API (y− arriba) a y+ arriba.
 */
export function radialDeadzone(x, y, dz, out, ySign = -1) {
  y *= ySign;
  const m = Math.hypot(x, y);
  if (m <= dz || m === 0) { out.x = 0; out.y = 0; return out; }
  const s = Math.min(1, (m - dz) / (1 - dz)) / m;
  out.x = x * s;
  out.y = y * s;
  return out;
}
