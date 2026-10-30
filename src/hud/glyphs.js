// Glifos de mando Xbox hechos con CSS (sin imágenes). Dueño: ui-hud-designer.
// glyph(button, device, ctx) → HTML. Solo se llama al construir el DOM o al cambiar de
// dispositivo (nunca por frame).
//
// Botones canónicos: A B X Y LB RB LT RT L3 R3 LS RS Up Down Left Right DPad View Menu.
// ctx: 'game' (acciones de combate) | 'ui' (menús). Con device === 'keyboard' se muestra la
// tecla del respaldo de teclado (arquitectura §3.7) si existe; si no, el glifo del mando.

const ALIAS = {
  dpadUp: 'Up', dpadDown: 'Down', dpadLeft: 'Left', dpadRight: 'Right',
  DUp: 'Up', DDown: 'Down', DLeft: 'Left', DRight: 'Right', DPAD: 'DPad', Dpad: 'DPad', dpad: 'DPad',
  Back: 'View', Select: 'View', Start: 'Menu', Pause: 'Menu',
  a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', l3: 'L3', r3: 'R3',
  ls: 'LS', rs: 'RS', view: 'View', menu: 'Menu', up: 'Up', down: 'Down', left: 'Left', right: 'Right',
};

export function normButton(b) {
  return ALIAS[b] || b;
}

// Respaldo de teclado (arquitectura §3.7 y extras de desarrollo de src/input/presets.js).
const KEYS_GAME = {
  A: 'Espacio', B: 'F', X: 'E', Y: 'C', LB: 'G', RB: 'R', LT: 'Clic der.', RT: 'Clic izq.', L3: 'Shift', R3: 'Q',
  Left: '1', Right: '2', Down: '3', Up: '4', View: 'Tab', Menu: 'Esc', LS: 'WASD', RS: 'Ratón',
};
const KEYS_UI = {
  A: 'Enter', B: 'Esc', Up: '↑', Down: '↓', Left: '←', Right: '→', Menu: 'Esc', DPad: '↑↓←→', LS: '↑↓←→',
};

const FACE = { A: 'a', B: 'b', X: 'x', Y: 'y' };
const DPAD_DIR = { Up: 'up', Down: 'down', Left: 'left', Right: 'right', DPad: 'all' };

/** HTML de un glifo de mando (siempre Xbox). */
export function padGlyph(button) {
  const b = normButton(button);
  if (FACE[b]) return `<span class="hz-g hz-g-face hz-g-${FACE[b]}">${b}</span>`;
  if (b === 'LB' || b === 'RB') return `<span class="hz-g hz-g-bumper">${b}</span>`;
  if (b === 'LT' || b === 'RT') return `<span class="hz-g hz-g-trigger">${b}</span>`;
  if (b === 'L3' || b === 'R3') return `<span class="hz-g hz-g-stick hz-g-click">${b === 'L3' ? 'LS' : 'RS'}</span>`;
  if (b === 'LS' || b === 'RS') return `<span class="hz-g hz-g-stick">${b}</span>`;
  if (DPAD_DIR[b]) return `<span class="hz-g hz-g-dpad hz-d-${DPAD_DIR[b]}"><i></i><i></i><b></b></span>`;
  if (b === 'View') return '<span class="hz-g hz-g-sys" title="View"><i class="hz-g-view"></i></span>';
  if (b === 'Menu') return '<span class="hz-g hz-g-sys" title="Menu"><i class="hz-g-menu"></i></span>';
  return `<span class="hz-g hz-k">${escapeHtml(String(b))}</span>`;
}

export function glyph(button, device = 'gamepad', ctx = 'game') {
  const b = normButton(button);
  if (device === 'keyboard') {
    const k = (ctx === 'ui' ? KEYS_UI : KEYS_GAME)[b];
    if (k) return `<span class="hz-g hz-k">${k}</span>`;
  }
  return padGlyph(b);
}

/** Uno o varios botones (array o "LB/RB") separados por "/". */
export function glyphs(buttons, device, ctx) {
  const list = Array.isArray(buttons) ? buttons : String(buttons).split('/');
  let html = '';
  for (let i = 0; i < list.length; i++) {
    if (i > 0) html += '<span class="hz-g-sep">/</span>';
    html += glyph(list[i], device, ctx);
  }
  return html;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** "#rrggbb" desde un color numérico de config (0x3fbf6f). */
export function hexColor(n) {
  return '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
}
