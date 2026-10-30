// Respaldo de teclado y ratón para desarrollo. Dueño: controls-camera-engineer.
// WASD mover · ratón mirar (pointer lock al hacer clic en el lienzo durante la partida) · Shift sprint ·
// Espacio cobertura · C saltar · F melee · R recargar · clic der. apuntar · clic izq. disparar ·
// Q hombro · 1/2/3 armas · Esc pausa · Enter confirmar. (Extras de desarrollo: E interactuar, G LB, 4 D-pad ↑.)
//
// Las pulsaciones se "enganchan" (latch) hasta el siguiente paso fijo: una tecla pulsada y soltada
// entre dos pasos cuenta como down durante un paso, así no se pierden toques rápidos.

export function createKeyboardReader() {
  const down = new Set();        // códigos mantenidos ahora
  const latched = new Set();     // pulsados desde el último consume()
  const mouseDown = [false, false, false];
  const mouseLatched = [false, false, false];
  const look = { x: 0, y: 0 };   // píxeles acumulados (movementX/Y) desde el último consumeLook()
  let activity = false;
  let canvas = null;
  let wantLock = () => false;

  const isTyping = (e) => {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };

  function onKeyDown(e) {
    if (isTyping(e)) return;
    activity = true;
    if (!down.has(e.code)) latched.add(e.code);
    down.add(e.code);
    // Evita que Espacio/Tab/flechas desplacen la página o muevan el foco.
    if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
  }
  function onKeyUp(e) { down.delete(e.code); }
  function onMouseDown(e) {
    activity = true;
    if (e.button >= 0 && e.button < 3) { mouseDown[e.button] = true; mouseLatched[e.button] = true; }
    if (canvas && e.target === canvas && wantLock() && document.pointerLockElement !== canvas) {
      try {
        const p = canvas.requestPointerLock && canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) { /* sin pointer lock (headless) */ }
    }
  }
  function onMouseUp(e) { if (e.button >= 0 && e.button < 3) mouseDown[e.button] = false; }
  function onMouseMove(e) {
    if (!canvas || document.pointerLockElement !== canvas) return;
    look.x += e.movementX || 0;
    look.y += e.movementY || 0;
    activity = true;
  }
  function onContextMenu(e) { if (canvas && e.target === canvas) e.preventDefault(); }
  function onBlur() {
    down.clear();
    mouseDown[0] = mouseDown[1] = mouseDown[2] = false;
  }

  function attach(canvasEl, shouldLock) {
    canvas = canvasEl || null;
    if (shouldLock) wantLock = shouldLock;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('blur', onBlur);
  }

  /** ¿Alguna de las teclas está abajo (o enganchada desde el último paso)? */
  function anyKey(codes) {
    if (!codes) return false;
    for (let i = 0; i < codes.length; i++) if (down.has(codes[i]) || latched.has(codes[i])) return true;
    return false;
  }
  function anyMouse(buttons) {
    if (!buttons) return false;
    for (let i = 0; i < buttons.length; i++) { const b = buttons[i]; if (mouseDown[b] || mouseLatched[b]) return true; }
    return false;
  }

  /** Fin de paso: limpia los enganches y devuelve si hubo actividad. */
  function endStep() {
    latched.clear();
    mouseLatched[0] = mouseLatched[1] = mouseLatched[2] = false;
    const a = activity;
    activity = false;
    return a;
  }

  /** Devuelve y pone a cero el movimiento de ratón acumulado (píxeles). Objeto reutilizado. */
  const lookOut = { x: 0, y: 0 };
  function consumeLook() {
    lookOut.x = look.x; lookOut.y = look.y;
    look.x = 0; look.y = 0;
    return lookOut;
  }

  function releasePointer() {
    if (canvas && document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
  }

  return {
    attach, dispose, anyKey, anyMouse, endStep, consumeLook, releasePointer,
    get locked() { return !!canvas && document.pointerLockElement === canvas; },
    get hadActivity() { return activity; },
  };
}
