// Texturas procedurales de FX (canvas, se generan una vez en init). Dueño: vfx-artist.
// También incluye un RNG local de FX: los efectos son puramente visuales y NO consumen
// game.rng para no alterar el determinismo de la simulación.

import * as THREE from 'three';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Cinta de trazadora: u = ancho (suave en los bordes), v = 0 cola (transparente) → 1 cabeza (brillante). */
export function makeTracerTexture() {
  return canvasTexture(16, 64, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      // canvas: y=0 arriba → v=1 (flipY por defecto), así que la cabeza va arriba.
      const along = 1 - y / (h - 1);
      const a = Math.pow(along, 1.6);
      for (let x = 0; x < w; x++) {
        const across = 1 - Math.abs((x + 0.5) / w * 2 - 1);
        const core = Math.pow(across, 2.2);
        const v = Math.min(1, core * a * 1.4);
        const i = (y * w + x) * 4;
        // Aditivo: el color también decae con el alpha.
        img.data[i] = img.data[i + 1] = img.data[i + 2] = img.data[i + 3] = Math.round(v * 255);
      }
    }
    g.putImageData(img, 0, 0);
  });
}

/** Estrella de fogonazo: núcleo blanco + 5 puntas. */
export function makeFlashTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    const cx = w / 2, cy = h / 2;
    const rad = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    rad.addColorStop(0, 'rgba(255,255,255,1)');
    rad.addColorStop(0.18, 'rgba(255,255,255,0.9)');
    rad.addColorStop(0.45, 'rgba(160,160,160,0.35)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(200,200,200,0.8)';
    const spikes = 5;
    for (let s = 0; s < spikes; s++) {
      const a = (s / spikes) * Math.PI * 2;
      const len = w * (s % 2 ? 0.42 : 0.5);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.lineTo(cx + Math.cos(a + 0.22) * w * 0.08, cy + Math.sin(a + 0.22) * w * 0.08);
      g.lineTo(cx + Math.cos(a - 0.22) * w * 0.08, cy + Math.sin(a - 0.22) * w * 0.08);
      g.closePath();
      g.fill();
    }
  });
}

/** Punto suave para chispas. */
export function makeSparkTexture() {
  return canvasTexture(32, 32, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const rad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rad.addColorStop(0, 'rgba(255,255,255,1)');
    rad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad; g.fillRect(0, 0, w, h);
  });
}

/** Marca de bala: agujero oscuro con halo chamuscado (alpha). */
export function makeDecalTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const scorch = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    scorch.addColorStop(0, 'rgba(10,8,6,1)');
    scorch.addColorStop(0.22, 'rgba(15,12,10,0.95)');
    scorch.addColorStop(0.5, 'rgba(35,28,22,0.5)');
    scorch.addColorStop(1, 'rgba(40,30,25,0)');
    g.fillStyle = scorch; g.fillRect(0, 0, w, h);
    // Grietas radiales
    g.strokeStyle = 'rgba(12,10,8,0.7)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = i * 1.07 + 0.3;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
      g.lineTo(cx + Math.cos(a) * (14 + (i % 3) * 5), cy + Math.sin(a) * (14 + (i % 3) * 5));
      g.stroke();
    }
  });
}

/** RNG visual (mulberry32). No usar en simulación. */
export function createFxRng(seed = 0x5eed) {
  let s = seed >>> 0;
  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(a, b) { return a + (b - a) * next(); },
    signed() { return next() * 2 - 1; },
  };
}
