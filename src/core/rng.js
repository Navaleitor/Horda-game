// RNG determinista con semilla (mulberry32). Dueño: game-architect.
// Usar game.rng (o createRng(seed)) en lugar de Math.random en la simulación.

export function createRng(seed = 1) {
  let s = seed >>> 0;

  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** [0, 1) */
    next,
    /** [min, max) */
    range(min, max) { return min + (max - min) * next(); },
    /** entero en [min, max] */
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    chance(p) { return next() < p; },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    /** [-1, 1) */
    signed() { return next() * 2 - 1; },
    get seed() { return s; },
    setSeed(v) { s = v >>> 0; },
  };
}
