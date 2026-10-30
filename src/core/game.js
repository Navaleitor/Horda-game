// Objeto `game`: contexto compartido entre sistemas. Dueño: game-architect.
// Ver docs/arquitectura.md §3 para el contrato completo.

import { createEventBus } from './events.js';
import { createRng } from './rng.js';
import config from './config.js';

/* global __DEBUG__ */

export function createGame({ renderer, scene, camera }) {
  const events = createEventBus();
  const services = new Map();
  const debugEntries = new Map();

  const game = {
    events,
    config,
    renderer,
    scene,
    camera,
    rng: createRng(config.core.seed),

    state: 'loading',
    session: { classId: null, difficulty: config.defaultDifficulty },

    entities: [],
    player: null,

    time: { now: 0, tick: 0, frame: 0 },

    /** Sistemas registrados (en orden). Los rellena main.js. */
    systems: [],

    setState(s) {
      if (s === game.state) return;
      const prev = game.state;
      game.state = s;
      events.emit('game:state', { state: s, prev });
    },

    addEntity(e) {
      if (game.entities.indexOf(e) < 0) game.entities.push(e);
      return e;
    },
    removeEntity(e) {
      const i = game.entities.indexOf(e);
      if (i >= 0) game.entities.splice(i, 1);
    },

    provide(name, api) {
      if (services.has(name) && __DEBUG__) {
        console.warn(`[game] servicio "${name}" reemplazado`);
      }
      services.set(name, api);
      return api;
    },
    service(name) {
      const s = services.get(name);
      if (!s) throw new Error(`[game] servicio no registrado: "${name}"`);
      return s;
    },
    hasService(name) { return services.has(name); },

    debug: {
      /** Expone `value` (o función) como window.__game[name] en builds --debug. */
      register(name, value) { debugEntries.set(name, value); },
      entries: debugEntries,
      enabled: __DEBUG__,
    },
  };

  return game;
}
