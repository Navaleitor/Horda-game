// Utilidades compartidas de animación (easing, springs, curvas, amortiguado). Dueño: animation-engineer.
// Todas son funciones puras o mutan objetos que pasa el llamador: no reservan memoria.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Mapea x de [a,b] a [0,1] recortado. */
export const remap01 = (x, a, b) => clamp01((x - a) / (b - a));
/** Lerp angular por el camino corto. */
export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
/** Envuelve un ángulo a (-π, π]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// ── Easing (t ∈ [0,1] → [0,1]) ──────────────────────────────────────────────
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => { const u = t - 1; return u * u * u + 1; },
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  inOutSine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; },
  smooth: (t) => t * t * (3 - 2 * t),
};

// ── Curvas ──────────────────────────────────────────────────────────────────
/** Campana 0→1→0 en [0,1] (seno). */
export const bell = (t) => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t));
/**
 * Envolvente ataque-sostén-salida: 0→1 en [0,a], 1 hasta d-r, 1→0 en [d-r,d]. t y tiempos en s.
 * Útil para poses de duración conocida (vault, swap, melee…).
 */
export function envelope(t, attack, release, duration) {
  if (t <= 0 || t >= duration) return 0;
  if (t < attack) return ease.smooth(t / attack);
  if (t > duration - release) return ease.smooth((duration - t) / release);
  return 1;
}
/**
 * Curva por tramos lineales sin reservas: keys = [t0, v0, t1, v1, …] (t creciente).
 * Fuera de rango devuelve el extremo.
 */
export function curve(keys, t) {
  const n = keys.length;
  if (t <= keys[0]) return keys[1];
  if (t >= keys[n - 2]) return keys[n - 1];
  for (let i = 2; i < n; i += 2) {
    if (t <= keys[i]) {
      const t0 = keys[i - 2], t1 = keys[i];
      return lerp(keys[i - 1], keys[i + 1], ease.smooth((t - t0) / (t1 - t0)));
    }
  }
  return keys[n - 1];
}

// ── Amortiguado y muelles ───────────────────────────────────────────────────
/** Acerca `current` a `target` de forma exponencial independiente del framerate (rate en 1/s). */
export const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
/** Acerca linealmente con velocidad máx. `speed` (unidades/s). */
export function approach(current, target, speed, dt) {
  const d = target - current, m = speed * dt;
  return d > m ? current + m : d < -m ? current - m : target;
}

/**
 * Muelle amortiguado escalar (crítico si damping = 2·sqrt(stiffness)).
 * s = createSpring(stiffness, damping) → { x, v, target }; stepSpring(s, dt); s.v += impulso.
 */
export function createSpring(stiffness = 120, damping = 18) {
  return { x: 0, v: 0, target: 0, k: stiffness, c: damping };
}
export function stepSpring(s, dt) {
  // Semi-implícito con subpasos para estabilidad con dt grandes.
  let rem = dt;
  while (rem > 0) {
    const h = rem > 1 / 120 ? 1 / 120 : rem;
    const a = s.k * (s.target - s.x) - s.c * s.v;
    s.v += a * h;
    s.x += s.v * h;
    rem -= h;
  }
  return s.x;
}

/** Fase cíclica [0,1) a partir de tiempo y periodo. */
export const cycle = (t, period) => { const p = t / period; return p - Math.floor(p); };
