// Bus de eventos pub/sub. Dueño: game-architect.
// - on(type, fn) devuelve una función off().
// - emit() no crea objetos: recorre el array de listeners existente.
// - Quitar listeners durante un emit es seguro (se marca y se compacta después).

export function createEventBus() {
  /** @type {Map<string, Function[]>} */
  const listeners = new Map();
  let emitting = 0;
  let dirty = false;
  const dirtyTypes = new Set();

  function on(type, fn) {
    let arr = listeners.get(type);
    if (!arr) { arr = []; listeners.set(type, arr); }
    arr.push(fn);
    return () => off(type, fn);
  }

  function once(type, fn) {
    const offFn = on(type, function wrapper(payload) {
      offFn();
      fn(payload);
    });
    return offFn;
  }

  function off(type, fn) {
    const arr = listeners.get(type);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i < 0) return;
    if (emitting > 0) {
      arr[i] = null; // se compacta al terminar el emit
      dirty = true;
      dirtyTypes.add(type);
    } else {
      arr.splice(i, 1);
    }
  }

  function emit(type, payload) {
    const arr = listeners.get(type);
    if (!arr || arr.length === 0) return;
    emitting++;
    try {
      // Longitud fija: los listeners añadidos durante el emit no se llaman en este ciclo.
      const n = arr.length;
      for (let i = 0; i < n; i++) {
        const fn = arr[i];
        if (fn !== null) fn(payload);
      }
    } finally {
      emitting--;
      if (emitting === 0 && dirty) compact();
    }
  }

  function compact() {
    for (const type of dirtyTypes) {
      const arr = listeners.get(type);
      if (!arr) continue;
      let w = 0;
      for (let r = 0; r < arr.length; r++) if (arr[r] !== null) arr[w++] = arr[r];
      arr.length = w;
    }
    dirtyTypes.clear();
    dirty = false;
  }

  function clear() { listeners.clear(); }

  function count(type) {
    const arr = listeners.get(type);
    if (!arr) return 0;
    let c = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] !== null) c++;
    return c;
  }

  return { on, once, off, emit, clear, count };
}
