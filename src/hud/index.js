// STUB: lo reemplaza ui-hud-designer
// Menú mínimo: en estado 'menu', Enter emite menu:start { classId:'medic', difficulty:'normal' }.
// Esc alterna pausa (game:pauseToggle).

export default function create() {
  let game = null;
  let el = null;
  let offState = null;

  function render() {
    if (!el) return;
    const s = game.state;
    el.textContent = s === 'menu' ? 'HORDA — pulsa Enter para empezar'
      : s === 'paused' ? 'PAUSA — Esc para continuar' : '';
    el.style.display = el.textContent ? '' : 'none';
  }

  function onKey(e) {
    if (e.code === 'Enter' && game.state === 'menu') {
      game.events.emit('menu:start', { classId: 'medic', difficulty: 'normal' });
    } else if (e.code === 'Escape' && (game.state === 'playing' || game.state === 'paused')) {
      game.events.emit('game:pauseToggle', {});
    }
  }

  return {
    name: 'hud',
    alwaysRun: true,
    init(g) {
      game = g;
      const root = document.getElementById('ui-root');
      el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:0;right:0;top:40%;text-align:center;font-size:28px;'
        + 'letter-spacing:0.1em;color:#fff;text-shadow:0 2px 6px #000';
      root.appendChild(el);
      window.addEventListener('keydown', onKey);
      offState = game.events.on('game:state', render);
      render();
    },
    fixedUpdate(dt) {},
    update(dt, alpha) {},
    dispose() {
      window.removeEventListener('keydown', onKey);
      if (offState) offState();
      if (el) el.remove();
    },
  };
}
