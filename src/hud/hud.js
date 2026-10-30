// HUD en partida: vida, arma/munición, ranuras del D-pad, recarga activa, retícula y hitmarker.
// Dueño: ui-hud-designer. Solo escucha eventos (arquitectura §3.8) y lee campos públicos de la
// entidad del jugador recibida en player:spawned (hp/maxHp, contrato Damageable §3.6).
// El DOM se toca solo cuando cambia un valor; las animaciones (cursor de recarga, hitmarker,
// avisos) son CSS y se congelan en pausa con .hz-paused.

import { glyph, hexColor } from './glyphs.js';

const SLOT_KEYS = ['Left', 'Right', 'Down'];

export function createGameHud(parent, game) {
  const cfg = game.config;
  const hudCfg = cfg.hud || {};
  const lowAmmo = hudCfg.ammoLowFraction != null ? hudCfg.ammoLowFraction : 0.25;
  const lowHp = hudCfg.lowHpFraction != null ? hudCfg.lowHpFraction : 0.3;
  const holdAfterReload = hudCfg.reloadResultHold != null ? hudCfg.reloadResultHold : 0.45;

  const el = document.createElement('div');
  el.className = 'hz-screen hz-game';
  // reloadBarWidth está en px de referencia a 720p (1 em ≈ 14.5 px); se pasa a em para que escale.
  el.style.setProperty('--rl-w', (hudCfg.reloadBarWidth || 220) / 14.5 + 'em');
  el.innerHTML = `
    <div class="hz-vit">
      <div class="hz-vit-head"><span class="hz-classdot"></span><span class="hz-cname"></span><span class="hz-hpnum">100</span></div>
      <div class="hz-hpbar"><div class="hz-hpfill"></div></div>
    </div>
    <div class="hz-xh"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><span class="hz-dot"></span></div>
    <div class="hz-hit"><i></i><i></i><i></i><i></i></div>
    <div class="hz-ammohint hz-hidden"></div>
    <div class="hz-rl">
      <div class="hz-rl-track"><div class="hz-rl-good"></div><div class="hz-rl-perf"></div>
        <div class="hz-rl-run"><div class="hz-rl-cur"></div></div></div>
      <div class="hz-rl-res"></div>
      <div class="hz-rl-hint"></div>
    </div>
    <div class="hz-toast"></div>
    <div class="hz-wpn">
      <div class="hz-slots">
        <div class="hz-slot s3"><span>Comodín</span></div>
        <div class="hz-slot s0"><span></span></div><div class="hz-slot s1"><span></span></div><div class="hz-slot s2"><span></span></div>
      </div>
      <div class="hz-wbox hz-panel">
        <div class="hz-wname"></div>
        <div class="hz-ammo"><span class="hz-mag">0</span><span class="hz-res">0</span></div>
        <div class="hz-magbar"><div class="hz-magfill"></div></div>
        <div class="hz-buff">Recarga perfecta · +daño</div>
      </div>
    </div>`;
  parent.appendChild(el);

  const q = (s) => el.querySelector(s);
  const vit = q('.hz-vit');
  const classDot = q('.hz-classdot');
  const cname = q('.hz-cname');
  const hpNum = q('.hz-hpnum');
  const hpFill = q('.hz-hpfill');
  const xh = q('.hz-xh');
  const hit = q('.hz-hit');
  const ammoHint = q('.hz-ammohint');
  const rl = q('.hz-rl');
  const rlGood = q('.hz-rl-good');
  const rlPerf = q('.hz-rl-perf');
  const rlRun = q('.hz-rl-run');
  const rlRes = q('.hz-rl-res');
  const rlHint = q('.hz-rl-hint');
  const toast = q('.hz-toast');
  const wbox = q('.hz-wbox');
  const wname = q('.hz-wname');
  const magEl = q('.hz-mag');
  const resEl = q('.hz-res');
  const magFill = q('.hz-magfill');
  const slotEls = [q('.hz-slot.s0'), q('.hz-slot.s1'), q('.hz-slot.s2')];
  const slotDpad = document.createElement('span');
  q('.hz-slots').appendChild(slotDpad);

  // ── Estado (primitivos; nada se aloca por frame) ────────────────────────
  const st = {
    player: null,
    hp: -1, maxHp: -1,
    weaponId: null, slot: 0,
    mag: -1, reserve: -1, magSize: 1,
    ammoClass: '',            // '' | 'low' | 'empty'
    hint: '',                 // '' | 'reload' | 'noammo'
    reloading: false, reloadResult: null, reloadHideT: 0,
    buffT: 0,
    aiming: false, sprint: false, inCover: false, xhHidden: false,
    hitFlip: false, toastFlip: false, rlFlip: false,
    slots: (cfg.weapons && cfg.weapons.startSlots ? cfg.weapons.startSlots.slice() : ['assaultRifle', null, 'pistol']),
    lastEmptyAt: -1,
  };
  /** Munición conocida por arma (se rellena con weapon:ammo). */
  const ammoCache = {};
  let device = 'gamepad';

  function weaponName(id) {
    const w = id && cfg.weapons && cfg.weapons[id];
    return w && w.name ? w.name : (id || '—');
  }
  function shortName(id) {
    if (!id) return 'Vacía';
    return weaponName(id).split(' ')[0];
  }

  function renderSlots() {
    for (let i = 0; i < 3; i++) {
      const id = st.slots[i];
      const s = slotEls[i];
      s.firstChild.textContent = shortName(id);
      s.classList.toggle('empty', !id);
      s.classList.toggle('cur', i === st.slot && !!id);
    }
  }

  function renderGlyphs() {
    slotDpad.innerHTML = glyph('DPad', 'gamepad');
    rlHint.innerHTML = `${glyph('RB', device)}<span>Recarga activa</span>`;
    renderHint(true);
  }

  // ── Vida ────────────────────────────────────────────────────────────────
  function setHp(hp, maxHp) {
    if (hp === st.hp && maxHp === st.maxHp) return;
    const hpI = Math.max(0, Math.ceil(hp));
    if (hpI !== Math.max(0, Math.ceil(st.hp))) hpNum.textContent = String(hpI);
    st.hp = hp; st.maxHp = maxHp;
    const f = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    hpFill.style.transform = `scaleX(${f.toFixed(3)})`;
    vit.classList.toggle('low', f <= lowHp);
  }

  function setClass(classId) {
    const c = classId && cfg.classes[classId];
    cname.textContent = c ? c.name : '';
    vit.style.setProperty('--cc', c ? hexColor(c.color) : '#888');
  }

  // ── Arma y munición ─────────────────────────────────────────────────────
  function setWeapon(id) {
    if (id === st.weaponId) return;
    st.weaponId = id;
    wname.textContent = weaponName(id);
    const cached = id && ammoCache[id];
    const w = id && cfg.weapons[id];
    if (cached) setAmmo(cached.mag, cached.reserve, cached.magSize);
    else if (w) setAmmo(w.magSize, w.reserve, w.magSize); // valores iniciales hasta el primer weapon:ammo
    cancelReload();
  }

  function setAmmo(mag, reserve, magSize) {
    if (magSize > 0) st.magSize = magSize;
    if (mag !== st.mag) {
      st.mag = mag;
      magEl.textContent = String(mag);
      magFill.style.transform = `scaleX(${Math.max(0, Math.min(1, mag / st.magSize)).toFixed(3)})`;
    }
    if (reserve !== st.reserve) { st.reserve = reserve; resEl.textContent = String(reserve); }
    const cls = mag <= 0 ? 'empty' : (mag / st.magSize <= lowAmmo ? 'low' : '');
    if (cls !== st.ammoClass) {
      wbox.classList.toggle('low', cls === 'low');
      wbox.classList.toggle('empty', cls === 'empty');
      st.ammoClass = cls;
    }
    renderHint(false);
  }

  function renderHint(force) {
    const h = st.reloading || st.mag > 0 || st.mag < 0 ? '' : (st.reserve > 0 ? 'reload' : 'noammo');
    if (h === st.hint && !force) return;
    st.hint = h;
    ammoHint.classList.toggle('hz-hidden', !h);
    if (h === 'reload') ammoHint.innerHTML = `${glyph('RB', device)}<span>Recargar</span>`;
    else if (h === 'noammo') ammoHint.innerHTML = '<span>Sin munición</span>';
  }

  // ── Recarga activa ──────────────────────────────────────────────────────
  function pct(v) { return (Math.max(0, Math.min(1, v)) * 100).toFixed(2) + '%'; }

  // goodWin: zona buena (ancha) del payload; si no viene, se toma de config.weapons[id].goodWindow.
  function startReload(weaponId, duration, win, goodWin) {
    const a = win && win.length > 1 ? win[0] : 0;
    const b = win && win.length > 1 ? win[1] : 0;
    const w = weaponId && cfg.weapons[weaponId];
    const gw = goodWin && goodWin.length > 1 ? goodWin : (w && w.goodWindow);
    rlPerf.style.left = pct(a); rlPerf.style.width = pct(b - a);
    if (gw) { rlGood.style.left = pct(gw[0]); rlGood.style.width = pct(gw[1] - gw[0]); rlGood.style.display = ''; }
    else rlGood.style.display = 'none';
    rlRun.style.animationDuration = (duration > 0 ? duration : 1) + 's';
    rlRun.classList.remove(st.rlFlip ? 'ra' : 'rb');
    st.rlFlip = !st.rlFlip;
    rlRun.classList.add(st.rlFlip ? 'ra' : 'rb');
    rl.classList.remove('done', 'perfect', 'good', 'failed');
    rl.classList.add('on');
    rlRes.textContent = '';
    st.reloading = true; st.reloadResult = null; st.reloadHideT = 0;
    renderHint(false);
  }

  function reloadResult(result) {
    if (!st.reloading) return;
    st.reloadResult = result;
    rl.classList.add('done', result);
    rlRes.textContent = result === 'perfect' ? '¡Perfecta!' : result === 'good' ? 'Buena' : 'Fallida · encasquillada';
    if (result === 'perfect') {
      st.buffT = cfg.activeReload ? cfg.activeReload.perfectBuffDuration : 5;
      wbox.classList.add('buff');
    }
  }

  function endReload() {
    if (!st.reloading) return;
    st.reloading = false;
    st.reloadHideT = st.reloadResult ? holdAfterReload : 0.01;
    rl.classList.add('done');
    renderHint(false);
  }

  function cancelReload() {
    st.reloading = false; st.reloadResult = null; st.reloadHideT = 0;
    rl.classList.remove('on');
  }

  // ── Retícula / hitmarker / avisos ───────────────────────────────────────
  function setAiming(a) {
    if (a === st.aiming) return;
    st.aiming = a;
    xh.classList.toggle('aim', a);
    updateXhVisibility();
  }
  function updateXhVisibility() {
    const hide = st.sprint || (st.inCover && !st.aiming);
    if (hide !== st.xhHidden) { st.xhHidden = hide; xh.classList.toggle('hide', hide); }
  }

  function hitmarker(head, killed) {
    hit.classList.remove('ha', 'hb');
    hit.classList.toggle('head', !!head && !killed);
    hit.classList.toggle('kill', !!killed);
    st.hitFlip = !st.hitFlip;
    hit.classList.add(st.hitFlip ? 'ha' : 'hb');
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.remove('show-a', 'show-b');
    st.toastFlip = !st.toastFlip;
    toast.classList.add(st.toastFlip ? 'show-a' : 'show-b');
  }

  function emptySlot(slot) {
    showToast('Ranura vacía');
    const s = slotEls[slot != null && slotEls[slot] ? slot : 1];
    s.classList.remove('flash');
    void s.offsetWidth; // reinicia la animación (solo en este evento)
    s.classList.add('flash');
  }

  // ── Eventos ─────────────────────────────────────────────────────────────
  function isMe(who) {
    if (who == null) return true;
    if (st.player) return who === st.player;
    return who.kind === 'player';
  }

  const handlers = {
    'player:spawned': ({ entity }) => {
      st.player = entity;
      setClass(entity && entity.classId ? entity.classId : game.session.classId);
      if (entity && entity.maxHp) setHp(entity.hp, entity.maxHp);
      if (entity && entity.inventory && entity.inventory.slots) {
        for (let i = 0; i < 3; i++) st.slots[i] = entity.inventory.slots[i] || null;
        st.slot = entity.inventory.current || 0;
        renderSlots();
        setWeapon(st.slots[st.slot]);
      }
    },
    'weapon:switchRequest': ({ who, slot, weaponId }) => {
      if (!isMe(who)) return;
      if (slot != null && slot >= 0 && slot < 3 && weaponId !== undefined) {
        if (weaponId) st.slots[slot] = weaponId;
      }
      if (!weaponId && (slot == null || !st.slots[slot])) { emptySlot(slot); return; }
    },
    'weapon:slotEmpty': ({ who, slot } = {}) => { if (isMe(who)) emptySlot(slot); },
    'weapon:switched': ({ who, weaponId, slot }) => {
      if (!isMe(who)) return;
      if (slot != null && slot >= 0 && slot < 3) { st.slot = slot; if (weaponId) st.slots[slot] = weaponId; }
      renderSlots();
      setWeapon(weaponId);
    },
    'weapon:ammo': ({ who, weaponId, mag, reserve, magSize }) => {
      if (!isMe(who)) return;
      let c = ammoCache[weaponId];
      if (!c) c = ammoCache[weaponId] = { mag: 0, reserve: 0, magSize: 1 };
      c.mag = mag; c.reserve = reserve; if (magSize > 0) c.magSize = magSize;
      if (weaponId === st.weaponId || st.weaponId == null) {
        if (st.weaponId == null) setWeapon(weaponId);
        setAmmo(mag, reserve, magSize);
      }
    },
    'weapon:reloadStart': ({ who, weaponId, duration, activeWindow, goodWindow }) => {
      if (isMe(who)) startReload(weaponId, duration, activeWindow, goodWindow);
    },
    // B (melee) o cambiar de arma cancela la recarga: se limpia la barra al instante.
    'weapon:reloadCancel': ({ who }) => { if (isMe(who)) { cancelReload(); renderHint(false); } },
    'weapon:activeReload': ({ who, result }) => { if (isMe(who)) reloadResult(result); },
    'weapon:reloaded': ({ who }) => { if (isMe(who)) endReload(); },
    'weapon:empty': ({ who }) => { if (isMe(who)) renderHint(false); },
    'damage:dealt': ({ source, target, part, killed }) => {
      if (st.player && source === st.player) hitmarker(part === 'head', killed);
      else if (!st.player && source && source.kind === 'player') hitmarker(part === 'head', killed);
      if (st.player && target === st.player) setHp(target.hp, target.maxHp);
    },
    'player:moveMode': ({ who, mode }) => {
      if (!isMe(who)) return;
      const s = mode === 'sprint';
      if (s !== st.sprint) { st.sprint = s; updateXhVisibility(); }
    },
    'cover:enter': ({ who }) => { if (isMe(who)) { st.inCover = true; updateXhVisibility(); } },
    'cover:exit': ({ who }) => { if (isMe(who)) { st.inCover = false; updateXhVisibility(); } },
  };

  const offs = [];
  for (const type in handlers) offs.push(game.events.on(type, handlers[type]));

  // Valores iniciales (antes del primer evento de combat).
  setClass(game.session.classId);
  renderSlots();
  setWeapon(st.slots[0]);
  setHp(cfg.player ? cfg.player.maxHp : 100, cfg.player ? cfg.player.maxHp : 100);
  renderGlyphs();

  return {
    el,
    st,
    show() { el.classList.add('on'); },
    hide() { el.classList.remove('on'); },
    setDevice(d) { if (d !== device) { device = d; renderGlyphs(); } },
    setClass,
    /** Paso fijo (solo en 'playing'): apuntado, vida (regeneración) y temporizadores. */
    fixedUpdate(dt, aiming) {
      setAiming(aiming);
      const p = st.player;
      if (p && (p.hp !== st.hp || p.maxHp !== st.maxHp)) setHp(p.hp, p.maxHp);
      if (st.buffT > 0) {
        st.buffT -= dt;
        if (st.buffT <= 0) wbox.classList.remove('buff');
      }
      if (st.reloadHideT > 0) {
        st.reloadHideT -= dt;
        if (st.reloadHideT <= 0 && !st.reloading) rl.classList.remove('on');
      }
    },
    dispose() { for (const off of offs) off(); el.remove(); },
  };
}
