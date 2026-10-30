// Estado de acciones lógicas por paso fijo. Dueño: controls-camera-engineer.
// Cada acción guarda: down, flanco de pulsación/suelta, tiempo mantenido, doble toque y
// (para la UI) autorepetición. El reloj es propio (avanza en todos los estados del juego).

export function createActionTable(names, cfg) {
  const table = new Map();
  for (const n of names) {
    table.set(n, {
      down: false,
      pressed: false,       // flanco ↓ en este paso (o repetición en acciones de UI)
      released: false,      // flanco ↑ en este paso
      held: 0,              // s mantenido (0 si no está abajo)
      lastPress: -1e9,      // instante de la última pulsación (para doble toque)
      doubleTap: false,     // segunda pulsación dentro de la ventana en este paso
      lastHeld: 0,          // duración de la última pulsación completa (s), útil para toque/mantener
      repeatT: 0,           // temporizador de autorepetición (UI)
      repeat: false,
    });
  }
  let clock = 0;

  /**
   * Avanza un paso. sample(name) → bool (down crudo). repeatSet: acciones con autorepetición.
   */
  function step(dt, sample, repeatSet) {
    clock += dt;
    const win = cfg.doubleTapWindow;
    for (const [name, a] of table) {
      const d = !!sample(name);
      const was = a.down;
      a.pressed = d && !was;
      a.released = !d && was;
      a.doubleTap = false;
      if (a.released) a.lastHeld = a.held;
      if (a.pressed) {
        if (clock - a.lastPress <= win) {
          a.doubleTap = true;
          a.lastPress = -1e9;   // un triple toque no cuenta como dos dobles
        } else {
          a.lastPress = clock;
        }
        a.held = 0;
        a.repeatT = cfg.menuRepeatDelay;
      } else if (d) {
        a.held += dt;
      } else {
        a.held = 0;
      }
      a.down = d;
      a.repeat = false;
      if (d && !a.pressed && repeatSet && repeatSet.has(name)) {
        a.repeatT -= dt;
        if (a.repeatT <= 0) {
          a.repeatT += cfg.menuRepeatRate;
          a.repeat = true;
        }
      }
    }
  }

  function get(name) {
    const a = table.get(name);
    if (!a && typeof console !== 'undefined') console.warn(`[input] acción desconocida: ${name}`);
    return a;
  }

  function resetAll() {
    for (const a of table.values()) {
      a.down = a.pressed = a.released = a.doubleTap = a.repeat = false;
      a.held = 0;
    }
  }

  return { table, step, get, resetAll, get clock() { return clock; } };
}
