// STUB: lo reemplaza controls-camera-engineer
// Servicio 'input' con la interfaz del contrato (docs/arquitectura.md §3) y métodos no-op.

export default function create() {
  const zero = { x: 0, y: 0 };
  const api = {
    device: 'keyboard',
    down(action) { return false; },
    pressed(action) { return false; },
    released(action) { return false; },
    heldTime(action) { return 0; },
    doubleTap(action) { return false; },
    axis(name) { zero.x = 0; zero.y = 0; return zero; },
    rumble(strong, weak, ms) {},
  };
  return {
    name: 'input',
    alwaysRun: true,
    init(game) { game.provide('input', api); },
    fixedUpdate(dt) {},
    update(dt, alpha) {},
    dispose() {},
  };
}
