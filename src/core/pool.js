// Pool genérico de objetos reutilizables. Dueño: game-architect.
// create(): fabrica un objeto nuevo. reset(obj): lo deja listo al soltarlo (opcional).

export function createPool(create, reset = null, initial = 0) {
  const free = [];
  let total = 0;
  for (let i = 0; i < initial; i++) { free.push(create()); total++; }

  return {
    acquire() {
      if (free.length > 0) return free.pop();
      total++;
      return create();
    },
    release(obj) {
      if (reset) reset(obj);
      free.push(obj);
    },
    get free() { return free.length; },
    get total() { return total; },
  };
}

/**
 * Anillo de tamaño fijo: acquire() devuelve el siguiente objeto, reciclando el más antiguo.
 * Útil para trazadoras, impactos y decals que caducan solos.
 */
export function createRing(size, create) {
  const items = new Array(size);
  for (let i = 0; i < size; i++) items[i] = create(i);
  let head = 0;
  return {
    items,
    acquire() {
      const it = items[head];
      head = (head + 1) % size;
      return it;
    },
  };
}
