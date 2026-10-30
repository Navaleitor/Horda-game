// Hash espacial 2D (plano XZ) de celdas uniformes. Dueño: physics-engineer.
//
// - Se usa para estáticos (ids de caja) y para dinámicos (índices de entidad).
// - Sin allocaciones en consulta: `query` rellena un array de salida reutilizado y
//   deduplica con sellos (stamps) por id; `cell(cx, cz)` devuelve el array interno de la celda.
// - `clear()` vacía las celdas usadas sin iterar el Map (lista `used`), para reconstrucción por paso.

const OFF = 32768;
function key(cx, cz) { return (cx + OFF) * 65536 + (cz + OFF); }

export function createSpatialHash(cellSize) {
  const inv = 1 / cellSize;
  const cells = new Map();
  const used = [];     // celdas no vacías (para clear barato)
  const stamps = [];   // stamps[id] = último sello de consulta que visitó el id
  let stamp = 0;

  const hash = {
    cellSize,
    inv,
    insert(id, minX, minZ, maxX, maxZ) {
      const x0 = Math.floor(minX * inv), x1 = Math.floor(maxX * inv);
      const z0 = Math.floor(minZ * inv), z1 = Math.floor(maxZ * inv);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const k = key(cx, cz);
          let arr = cells.get(k);
          if (!arr) { arr = []; cells.set(k, arr); }
          if (arr.length === 0) used.push(arr);
          arr.push(id);
        }
      }
      if (stamps[id] === undefined) stamps[id] = 0;
    },
    clear() {
      for (let i = 0; i < used.length; i++) used[i].length = 0;
      used.length = 0;
    },
    /** Array interno de la celda (no modificar) o undefined. */
    cell(cx, cz) { return cells.get(key(cx, cz)); },
    /** Inicia una consulta con deduplicación (para recorridos manuales de celdas). */
    begin() { stamp++; return stamp; },
    /** true la primera vez que se visita `id` en la consulta actual. */
    visit(id) {
      if (stamps[id] === stamp) return false;
      stamps[id] = stamp;
      return true;
    },
    /** Ids cuyas celdas tocan el rectángulo XZ. Rellena y devuelve `out` (reutilizado). */
    query(minX, minZ, maxX, maxZ, out) {
      out.length = 0;
      const s = ++stamp;
      const x0 = Math.floor(minX * inv), x1 = Math.floor(maxX * inv);
      const z0 = Math.floor(minZ * inv), z1 = Math.floor(maxZ * inv);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const arr = cells.get(key(cx, cz));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const id = arr[i];
            if (stamps[id] !== s) { stamps[id] = s; out.push(id); }
          }
        }
      }
      return out;
    },
    stats() { return { cells: cells.size, used: used.length }; },
  };
  return hash;
}
