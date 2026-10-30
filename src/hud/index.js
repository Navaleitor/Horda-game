// Sistema HUD (alwaysRun). Dueño: ui-hud-designer.
// Pantallas: menú de inicio (clase + dificultad), HUD en partida, pausa, panel de controles, prompts.
// Contrato: docs/arquitectura.md §3. Emite 'menu:start' y 'game:pauseToggle' (único emisor).
//
// Entrada: servicio 'input' (acciones uiUp/uiDown/uiLeft/uiRight/uiConfirm/uiBack/pause, 'aim',
// input.device). Respaldo propio de teclado en menús (flechas, Enter, Retroceso, Esc); se combina
// por OR con el servicio en el mismo paso fijo, así una misma tecla nunca cuenta dos veces.
//
// DOM (dentro de #ui-root):
//   div.hz                       raíz (escala de fuente por altura de ventana; .hz-paused en pausa)
//     div.hz-screen.hz-game      HUD en partida (hud.js)
//     div.hz-prompts             prompts contextuales (prompts.js)
//     div.hz-screen.hz-menu      menú de inicio (startMenu.js)
//     div.hz-screen.hz-pause     pausa + confirmación de salida (pauseMenu.js)
//     div.hz-screen.hz-pause     panel de controles E-Day (pauseMenu.js → createControlsPanel)

import { injectStyles, removeStyles } from './styles.js';
import { NAV } from './nav.js';
import { createStartMenu } from './startMenu.js';
import { createPauseMenu, createControlsPanel } from './pauseMenu.js';
import { createGameHud } from './hud.js';
import { createPrompts } from './prompts.js';

const KEY_NAV = {
  ArrowUp: NAV.UP, ArrowDown: NAV.DOWN, ArrowLeft: NAV.LEFT, ArrowRight: NAV.RIGHT,
  Enter: NAV.CONFIRM, NumpadEnter: NAV.CONFIRM, Backspace: NAV.BACK,
};

export default function create() {
  let game = null;
  let input = null;
  let root = null;
  let startMenu = null;
  let pauseMenu = null;
  let controls = null;
  let gameHud = null;
  let prompts = null;
  const offs = [];

  let keyNav = 0;               // banderas del respaldo de teclado, se consumen en fixedUpdate
  let device = 'gamepad';
  // Sub-pantalla: 'menu' | 'menuControls' | 'hud' | 'pause' | 'pauseControls' | 'loading'
  let screen = 'loading';
  let started = false;          // menu:start ya emitido (evita dobles)

  function setScreen(s) {
    if (s === screen) return;
    screen = s;
    const st = game.state;
    if (s === 'menu') startMenu.show(); else startMenu.hide();
    if (s === 'pause') pauseMenu.show(); else pauseMenu.hide();
    if (s === 'menuControls' || s === 'pauseControls') controls.show(); else controls.hide();
    const inGame = st === 'playing' || st === 'paused';
    if (inGame) gameHud.show(); else gameHud.hide();
    prompts.el.style.display = st === 'playing' ? '' : 'none';
  }

  function onState({ state }) {
    root.classList.toggle('hz-paused', state === 'paused');
    if (state === 'menu') setScreen('menu');
    else if (state === 'playing') setScreen('hud');
    else if (state === 'paused') setScreen('pause');
    else setScreen('loading');
    // setScreen no repite si la sub-pantalla no cambia; forzamos visibilidad del HUD de juego.
    const inGame = state === 'playing' || state === 'paused';
    if (inGame) gameHud.show(); else gameHud.hide();
    prompts.el.style.display = state === 'playing' ? '' : 'none';
  }

  function emitStart(classId, difficulty) {
    if (started || game.state !== 'menu') return;
    started = true;
    gameHud.setClass(classId);
    const d = game.config.difficulties[difficulty];
    const c = game.config.classes[classId];
    pauseMenu.setInfo(`${c ? c.name : classId} · ${d ? d.name : difficulty}`);
    game.events.emit('menu:start', { classId, difficulty });
  }

  function togglePause() {
    if (game.state === 'playing' || game.state === 'paused') game.events.emit('game:pauseToggle', {});
  }

  function onKey(e) {
    if (e.code === 'Escape') {
      keyNav |= game.state === 'menu' ? NAV.BACK : NAV.PAUSE;
      return;
    }
    const st = game.state;
    if (st !== 'menu' && st !== 'paused') return;
    const f = KEY_NAV[e.code];
    if (!f) return;
    if (e.repeat && (f & (NAV.CONFIRM | NAV.BACK))) return;
    keyNav |= f;
    e.preventDefault();
  }

  function readNav() {
    let nav = keyNav;
    keyNav = 0;
    if (input) {
      if (input.pressed('pause')) nav |= NAV.PAUSE;
      const st = game.state;
      if (st === 'menu' || st === 'paused') {
        if (input.pressed('uiUp')) nav |= NAV.UP;
        if (input.pressed('uiDown')) nav |= NAV.DOWN;
        if (input.pressed('uiLeft')) nav |= NAV.LEFT;
        if (input.pressed('uiRight')) nav |= NAV.RIGHT;
        if (input.pressed('uiConfirm')) nav |= NAV.CONFIRM;
        if (input.pressed('uiBack')) nav |= NAV.BACK;
      }
    }
    return nav;
  }

  function syncDevice() {
    const d = input && input.device ? input.device : 'gamepad';
    if (d === device) return;
    device = d;
    startMenu.setDevice(d);
    pauseMenu.setDevice(d);
    controls.setDevice(d);
    gameHud.setDevice(d);
    prompts.setDevice(d);
  }

  const debugApi = {
    get screen() { return screen; },
    get device() { return device; },
    get selection() {
      return {
        row: startMenu.rowName,
        classId: startMenu.classId,
        difficulty: startMenu.difficulty,
        pauseItem: pauseMenu.itemId,
      };
    },
    get prompts() { return prompts.list(); },
    get weapon() {
      const s = gameHud.st;
      return { weaponId: s.weaponId, slot: s.slot, mag: s.mag, reserve: s.reserve, reloading: s.reloading,
        reloadResult: s.reloadResult, slots: s.slots.slice() };
    },
    get hp() { return { hp: gameHud.st.hp, maxHp: gameHud.st.maxHp }; },
    get aiming() { return gameHud.st.aiming; },
    /** Instantánea serializable para Playwright. */
    state() {
      return { screen, device, selection: debugApi.selection, prompts: debugApi.prompts, weapon: debugApi.weapon,
        hp: debugApi.hp, aiming: debugApi.aiming };
    },
    select(classId, difficulty) { startMenu.select(classId, difficulty); },
  };

  return {
    name: 'hud',
    alwaysRun: true,
    init(g) {
      game = g;
      input = game.hasService('input') ? game.service('input') : null;
      injectStyles();
      const host = document.getElementById('ui-root');
      root = document.createElement('div');
      root.className = 'hz';
      const hc = game.config.hud || {};
      if (hc.hitmarkerTime != null) root.style.setProperty('--hit-time', hc.hitmarkerTime + 's');
      if (hc.promptFade != null) root.style.setProperty('--prompt-fade', hc.promptFade + 's');
      host.appendChild(root);

      gameHud = createGameHud(root, game);
      prompts = createPrompts(root);
      startMenu = createStartMenu(root, game, {
        onStart: emitStart,
        onControls: () => setScreen('menuControls'),
      });
      pauseMenu = createPauseMenu(root, {
        onResume: togglePause,
        onControls: () => setScreen('pauseControls'),
        onQuit: () => { location.reload(); },
      });
      controls = createControlsPanel(root);
      controls.onClick(() => setScreen(game.state === 'menu' ? 'menu' : 'pause'));

      gameHud.hide();
      prompts.el.style.display = 'none';
      device = '';
      syncDevice();

      offs.push(game.events.on('game:state', onState));
      offs.push(game.events.on('prompt:show', (p) => prompts.show(p)));
      offs.push(game.events.on('prompt:hide', (p) => prompts.hide(p)));
      offs.push(game.events.on('menu:start', ({ classId }) => { started = true; gameHud.setClass(classId); }));

      window.addEventListener('keydown', onKey);
      game.debug.register('hud', debugApi);
      onState({ state: game.state });
    },

    fixedUpdate(dt) {
      if (!input && game.hasService('input')) input = game.service('input');
      syncDevice();
      const nav = readNav();
      const st = game.state;

      if (st === 'playing') {
        if (nav & NAV.PAUSE) { togglePause(); return; }
        gameHud.fixedUpdate(dt, input ? !!input.down('aim') : false);
        return;
      }
      if (st === 'paused') {
        if (nav & NAV.PAUSE) { togglePause(); return; }
        if (screen === 'pauseControls') { if (controls.handle(nav)) setScreen('pause'); }
        else pauseMenu.handle(nav);
        return;
      }
      if (st === 'menu') {
        if (screen === 'menuControls') { if (controls.handle(nav)) setScreen('menu'); }
        else startMenu.handle(nav);
      }
    },

    update(dt, alpha) {},

    dispose() {
      window.removeEventListener('keydown', onKey);
      for (const off of offs) off();
      offs.length = 0;
      if (gameHud) gameHud.dispose();
      if (root) root.remove();
      removeStyles();
    },
  };
}
