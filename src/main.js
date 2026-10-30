// Bootstrap del juego. Dueño: game-architect.
// Crea renderer/escena/cámara y el objeto game, carga modelos, registra los sistemas
// en el orden del contrato (docs/arquitectura.md §3) y arranca el loop en estado 'menu'.

import * as THREE from 'three';
import config from './core/config.js';
import { createGame } from './core/game.js';
import { createLoop } from './core/loop.js';
import createDebug from './core/debug.js';
import { loadModels } from './assets/models.js';

import createInput from './input/index.js';
import createPhysics from './physics/index.js';
import createLevel from './level/index.js';
import createAnim from './anim/core/index.js';
import createFx from './fx/index.js';
import createPlayer from './player/index.js';
import createCombat from './combat/index.js';
import createCamera from './camera/index.js';
import createHud from './hud/index.js';

/* global __DEBUG__ */

function showBootMessage(text, isError = false) {
  const el = document.getElementById('boot');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', isError);
  el.style.display = text ? '' : 'none';
}

// Solo --debug: ?lowgfx baja la calidad (sin sombras ni antialias, media resolución) para que las
// pruebas headless con render por software mantengan suficientes pasos de simulación por segundo.
const LOW_GFX = __DEBUG__ && /[?&]lowgfx\b/.test(location.search);

function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: !LOW_GFX, powerPreference: 'high-performance' });
  renderer.setPixelRatio(LOW_GFX ? 0.5 : Math.min(window.devicePixelRatio || 1, config.core.pixelRatioMax));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !LOW_GFX;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

async function boot() {
  const container = document.getElementById('app');
  const renderer = createRenderer(container);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const cam = config.camera;
  const camera = new THREE.PerspectiveCamera(cam.fov, window.innerWidth / window.innerHeight, cam.near, cam.far);

  const game = createGame({ renderer, scene, camera });
  const loop = createLoop(game);
  game.loop = loop;

  // Resize
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    game.events.emit('view:resize', { width: w, height: h });
  }
  window.addEventListener('resize', onResize);

  // menu:start — core fija la sesión ANTES de que ningún sistema reciba el evento…
  game.events.on('menu:start', ({ classId, difficulty }) => {
    game.session.classId = classId;
    game.session.difficulty = difficulty || config.defaultDifficulty;
  });

  async function register(system) {
    await system.init(game);
    game.systems.push(system);
  }

  // Orden del contrato (docs/arquitectura.md §3).
  showBootMessage('Cargando…');
  await register(createInput());            // 1 → servicio 'input'
  await register(createPhysics());          // 2 → servicio 'physics'
  game.provide('models', await loadModels()); // 3 → servicio 'models' (no es sistema)
  await register(createLevel());            // 4 → servicio 'level'
  await register(createAnim());             // 5 → servicio 'anim'
  await register(createFx());               // 6
  await register(createPlayer());           // 7
  await register(createCombat());           // 8
  await register(createCamera());           // 9 → servicio 'camera'
  await register(createHud());              // 10
  if (__DEBUG__) await register(createDebug()); // 11 (solo --debug)

  // …y pasa a 'playing' DESPUÉS de que todos los sistemas lo hayan procesado (spawn del jugador).
  game.events.on('menu:start', () => {
    game.setState('playing');
  });

  game.events.on('game:pauseToggle', () => {
    if (game.state === 'playing') game.setState('paused');
    else if (game.state === 'paused') game.setState('playing');
  });

  showBootMessage('');
  game.setState('menu');
  loop.start();
  return game;
}

boot().catch((err) => {
  console.error('[horda] error al arrancar:', err);
  showBootMessage(`Error al cargar el juego:\n${err && err.stack ? err.stack : err}`, true);
});
