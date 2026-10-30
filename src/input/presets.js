// Presets de control. Dueño: controls-camera-engineer.
// Fuente de verdad: docs/horda-gdd.md §1 y docs/arquitectura.md §3.7 (servicio `input`).
// Cualquier cambio de botón aquí exige actualizar a la vez el GDD §1 y docs/qa/checklist-controles.md.
//
// Índices de la Gamepad API con mapping "standard" (mando Xbox):
//   A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 View=8 Menu=9 L3=10 R3=11 ↑=12 ↓=13 ←=14 →=15
//   Ejes: 0=LS.x 1=LS.y 2=RS.x 3=RS.y (la API da y NEGATIVO hacia arriba; input lo invierte).

export const PAD = Object.freeze({
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  View: 8, Menu: 9, L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15,
});

/** Botones analógicos (gatillos): cuentan como "down" por encima de config.input.triggerThreshold. */
export const ANALOG_BUTTONS = Object.freeze([PAD.LT, PAD.RT]);

/** Acciones de UI con autorepetición (D-pad y LS). */
export const UI_REPEAT = Object.freeze(['uiUp', 'uiDown', 'uiLeft', 'uiRight']);

/**
 * E-Day Default adaptado (GDD §1). `pad`: acción → índices de botón.
 * `uiStick`: acciones de UI que también se disparan inclinando LS (eje, signo).
 * `keys`: respaldo de teclado (KeyboardEvent.code). `mouse`: botón del ratón (0 izq., 2 der.).
 */
export const E_DAY_DEFAULT = Object.freeze({
  id: 'eday',
  name: 'E-Day Default',
  pad: {
    // Combate
    cover: [PAD.A],          // cobertura · A+dir en cobertura = SWAT/deslizar · sin cobertura y en movimiento = maroma · doble toque = maroma
    melee: [PAD.B],          // golpe cuerpo a cuerpo (con pieza en manos: soltar — Fase 1b)
    interact: [PAD.X],       // interactuar (Fase 1b+)
    jump: [PAD.Y],           // saltar · trepar · saltar sobre cobertura
    lb: [PAD.LB],            // toque = granada · mantener = Tac-Com (Fase 2)
    reload: [PAD.RB],        // recargar (toque de nuevo = recarga activa)
    aim: [PAD.LT],
    fire: [PAD.RT],
    view: [PAD.View],        // mantener = marcador (Fase 4)
    pause: [PAD.Menu],
    shoulder: [PAD.R3],
    dpadUp: [PAD.Up],        // radial de comodines (Fase 4)
    dpadDown: [PAD.Down],    // pistola / pistola de reparación
    dpadLeft: [PAD.Left],    // rifle de asalto (ranura 0)
    dpadRight: [PAD.Right],  // arma comprada (ranura 1)
    // Menús
    uiConfirm: [PAD.A],
    uiBack: [PAD.B],
    uiUp: [PAD.Up],
    uiDown: [PAD.Down],
    uiLeft: [PAD.Left],
    uiRight: [PAD.Right],
    uiTabNext: [PAD.RB],
    uiTabPrev: [PAD.LB],
  },
  uiStick: {
    uiUp: { axis: 'y', sign: 1 },
    uiDown: { axis: 'y', sign: -1 },
    uiLeft: { axis: 'x', sign: -1 },
    uiRight: { axis: 'x', sign: 1 },
  },
  axes: {
    move: { x: 0, y: 1 },
    look: { x: 2, y: 3 },
  },
  // Respaldo de desarrollo (docs/arquitectura.md §3.7). No es un esquema de juego final.
  keys: {
    cover: ['Space'],
    jump: ['KeyC'],
    melee: ['KeyF'],
    reload: ['KeyR'],
    shoulder: ['KeyQ'],
    interact: ['KeyE'],
    lb: ['KeyG'],
    view: ['Tab'],
    pause: ['Escape'],
    dpadLeft: ['Digit1'],
    dpadRight: ['Digit2'],
    dpadDown: ['Digit3'],
    dpadUp: ['Digit4'],
    uiConfirm: ['Enter', 'NumpadEnter'],
    uiBack: ['Backspace', 'Escape'],
    uiUp: ['ArrowUp', 'KeyW'],
    uiDown: ['ArrowDown', 'KeyS'],
    uiLeft: ['ArrowLeft', 'KeyA'],
    uiRight: ['ArrowRight', 'KeyD'],
    uiTabNext: ['KeyE', 'PageDown'],
    uiTabPrev: ['KeyQ', 'PageUp'],
  },
  keyAxes: {
    move: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'] },
  },
  mouse: {
    fire: [0],
    aim: [2],
  },
});

export const PRESETS = Object.freeze({ eday: E_DAY_DEFAULT });

/** Lista de todas las acciones del preset (orden estable). */
export function actionNames(preset = E_DAY_DEFAULT) {
  const set = new Set([...Object.keys(preset.pad), ...Object.keys(preset.keys), ...Object.keys(preset.mouse)]);
  return [...set];
}

/** Nombre corto del botón de mando para prompts del HUD (p. ej. 'A', 'LT', 'Right'). */
export function padButtonName(action, preset = E_DAY_DEFAULT) {
  const idx = preset.pad[action];
  if (!idx || !idx.length) return null;
  for (const k in PAD) if (PAD[k] === idx[0]) return k;
  return null;
}
